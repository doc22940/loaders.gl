// TODO bring back to deck
// Add temporaly for testing

import {Vector3} from '@math.gl/core';
import {COORDINATE_SYSTEM, CompositeLayer} from '@deck.gl/core';
import {PointCloudLayer} from '@deck.gl/layers';
import {ScenegraphLayer, SimpleMeshLayer} from '@deck.gl/mesh-layers';
import {log} from '@deck.gl/core';
import {Geometry} from '@luma.gl/core';
import GL from '@luma.gl/constants';

import {load} from '@loaders.gl/core';
import {Tileset3D, TILE_TYPE} from '@loaders.gl/tiles';

const defaultProps = {
  getPointColor: [0, 0, 0],
  pointSize: 1.0,

  data: null,
  _ionAssetId: null,
  _ionAccessToken: null,
  loadOptions: {throttleRequests: true},

  onTilesetLoad: tileset3d => {},
  onTileLoad: tileHeader => {},
  onTileUnload: tileHeader => {},
  onTileError: (tile, message, url) => {}
};

const scratchOffset = new Vector3(0, 0, 0);

export default class Tile3DLayer extends CompositeLayer {
  initializeState() {
    if ('onTileLoadFail' in this.props) {
      log.removed('onTileLoadFail', 'onTileError')();
    }
    // prop verification
    this.state = {
      layerMap: {},
      tileset3d: null
    };
  }

  shouldUpdateState({changeFlags}) {
    return changeFlags.somethingChanged;
  }

  updateState({props, oldProps, changeFlags}) {
    if (props.data && props.data !== oldProps.data) {
      this._loadTileset(props.data);
    }

    if (changeFlags.viewportChanged) {
      const {tileset3d} = this.state;
      this._updateTileset(tileset3d);
    }
  }

  getPickingInfo({info, sourceLayer}) {
    const {layerMap} = this.state;
    const layerId = sourceLayer && sourceLayer.id;
    if (layerId) {
      // layerId: this.id-[scenegraph|pointcloud]-tileId
      const substr = layerId.substring(this.id.length + 1);
      const tileId = substr.substring(substr.indexOf('-') + 1);
      info.object = layerMap[tileId] && layerMap[tileId].tile;
    }

    return info;
  }

  async _loadTileset(tilesetUrl) {
    const {loader, loadOptions} = this.props;
    const options = {
      ...loadOptions,
      isTileset: true
    };
    const tilesetJson = await load(tilesetUrl, loader, options);
    const tileset3d = new Tileset3D(tilesetJson, {
      onTileLoad: this._onTileLoad.bind(this),
      onTileUnload: this.props.onTileUnload,
      onTileLoadFail: this.props.onTileError,
      fetchOptions: options
    });

    this.setState({
      tileset3d,
      layerMap: {}
    });

    this._updateTileset(tileset3d);
    this.props.onTilesetLoad(tileset3d);
  }

  _onTileLoad(tileHeader) {
    this.props.onTileLoad(tileHeader);
    this._updateTileset(this.state.tileset3d);
  }

  _updateTileset(tileset3d) {
    const {timeline, viewport} = this.context;
    if (!timeline || !viewport || !tileset3d) {
      return;
    }
    const frameNumber = tileset3d.update(viewport);
    this._updateLayerMap(frameNumber);
  }

  // `Layer` instances is created and added to the map if it doesn't exist yet.
  _updateLayerMap(frameNumber) {
    const {tileset3d, layerMap} = this.state;

    // create layers for new tiles
    const {selectedTiles} = tileset3d;
    const tilesWithoutLayer = selectedTiles.filter(tile => !layerMap[tile.id]);

    for (const tile of tilesWithoutLayer) {
      layerMap[tile.id] = {
        layer: this._create3DTileLayer(tile),
        tile
      };
    }

    // update layer visibility
    this._updateLayers(frameNumber);
  }

  // Grab only those layers who were selected this frame.
  _updateLayers(frameNumber) {
    const {layerMap} = this.state;
    const layerMapValues = Object.values(layerMap);

    for (const value of layerMapValues) {
      const {tile} = value;
      let {layer} = value;

      if (tile._selectedFrame === frameNumber) {
        if (layer && layer.props && !layer.props.visible) {
          // Still has GPU resource but visibility is turned off so turn it back on so we can render it.
          layer = layer.clone({visible: true});
          layerMap[tile.id].layer = layer;
        }
      } else if (tile.contentUnloaded) {
        // Was cleaned up from tileset cache. We no longer need to track it.
        delete layerMap[tile.id];
      } else if (layer && layer.props && layer.props.visible) {
        // Still in tileset cache but doesn't need to render this frame. Keep the GPU resource bound but don't render it.
        layer = layer.clone({visible: false});
        layerMap[tile.id].layer = layer;
      }
    }

    this.setState({layers: Object.values(layerMap).map(layer => layer.layer)});
  }

  _create3DTileLayer(tileHeader) {
    if (!tileHeader.content) {
      return null;
    }

    switch (tileHeader.type) {
      case TILE_TYPE.POINTCLOUD:
        return this._createPointCloudTileLayer(tileHeader);
      case TILE_TYPE.SCENEGRAPH:
        return this._create3DModelTileLayer(tileHeader);
      case TILE_TYPE.SIMPLEMESH:
        return this._createSimpleMeshLayer(tileHeader);
      default:
        throw new Error(`Tile3DLayer: Failed to render layer of type ${tileHeader.type}`);
    }
  }

  _create3DModelTileLayer(tileHeader) {
    const {gltf, instances, cartographicOrigin, modelMatrix} = tileHeader.content;

    const SubLayerClass = this.getSubLayerClass('scenegraph', ScenegraphLayer);

    return new SubLayerClass(
      {
        _lighting: 'pbr'
      },
      this.getSubLayerProps({
        id: 'scenegraph'
      }),
      {
        id: `${this.id}-scenegraph-${tileHeader.id}`,
        // Fix for ScenegraphLayer.modelMatrix, under flag in deck 7.3 to avoid breaking existing code
        data: instances || [{}],
        scenegraph: gltf,

        coordinateSystem: COORDINATE_SYSTEM.METER_OFFSETS,
        coordinateOrigin: cartographicOrigin,
        modelMatrix,
        getTransformMatrix: instance => instance.modelMatrix,
        getPosition: instance => [0, 0, 0]
      }
    );
  }

  _createPointCloudTileLayer(tileHeader) {
    const {
      attributes,
      pointCount,
      constantRGBA,
      cartographicOrigin,
      modelMatrix
    } = tileHeader.content;
    const {positions, normals, colors} = attributes;

    if (!positions) {
      return null;
    }

    const {pointSize, getPointColor} = this.props;
    const SubLayerClass = this.getSubLayerClass('pointcloud', PointCloudLayer);
    return new SubLayerClass(
      {
        pointSize
      },
      this.getSubLayerProps({
        id: 'pointcloud'
      }),
      {
        id: `${this.id}-pointcloud-${tileHeader.id}`,
        data: {
          header: {
            vertexCount: pointCount
          },
          attributes: {
            POSITION: positions,
            NORMAL: normals,
            COLOR_0: colors
          }
        },
        coordinateSystem: COORDINATE_SYSTEM.METER_OFFSETS,
        coordinateOrigin: cartographicOrigin,
        modelMatrix,

        getColor: constantRGBA || getPointColor
      }
    );
  }

  _createSimpleMeshLayer(tileHeader) {
    const content = tileHeader.content;
    const {attributes, modelMatrix, cartographicOrigin, texture} = content;
    const positions = new Float32Array(attributes.position.value.length);
    for (let i = 0; i < positions.length; i += 3) {
      scratchOffset.copy(modelMatrix.transform(attributes.position.value.subarray(i, i + 3)));
      positions.set(scratchOffset, i);
    }

    const geometry = new Geometry({
      drawMode: GL.TRIANGLES,
      attributes: {
        positions,
        normals: attributes.normal,
        texCoords: attributes.uv0
      }
    });

    return new SimpleMeshLayer({
      id: `mesh-layer-${tileHeader.id}`,
      mesh: geometry,
      data: [{}],
      getPosition: [0, 0, 0],
      getColor: [255, 255, 255],
      texture,
      coordinateOrigin: cartographicOrigin,
      coordinateSystem: COORDINATE_SYSTEM.METER_OFFSETS
    });
  }

  renderLayers() {
    return this.state.layers;
  }
}

Tile3DLayer.layerName = 'Tile3DLayer';
Tile3DLayer.defaultProps = defaultProps;
