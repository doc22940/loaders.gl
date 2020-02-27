// TODO delete when deck.gl has a newer version of tile-3d-layer
// A copy from 'examples/deck.gl/3d-tiles/tile-3d-layer.js

import {Vector3} from '@math.gl/core';
import GL from '@luma.gl/constants';
import {Geometry} from '@luma.gl/core';
import {COORDINATE_SYSTEM, CompositeLayer} from '@deck.gl/core';
import {PointCloudLayer} from '@deck.gl/layers';
import {ScenegraphLayer, SimpleMeshLayer} from '@deck.gl/mesh-layers';
import {log} from '@deck.gl/core';

import {load} from '@loaders.gl/core';
import {Tileset3D, TILE_TYPE} from '@loaders.gl/tiles';

const scratchOffset = new Vector3();

const defaultProps = {
  getPointColor: [0, 0, 0],
  pointSize: 1.0,

  data: null,
  loadOptions: {throttleRequests: true},

  onTilesetLoad: tileset3d => {},
  onTileLoad: tileHeader => {},
  onTileUnload: tileHeader => {},
  onTileError: (tile, message, url) => {}
};

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
    const tilesetJson = await load(tilesetUrl, loader, loadOptions);
    const tileset3d = new Tileset3D(tilesetJson, {
      onTileLoad: this._onTileLoad.bind(this),
      onTileUnload: this.props.onTileUnload,
      onTileLoadFail: this.props.onTileError,
      fetchOptions: loadOptions
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
    this.setNeedsUpdate();
  }

  _updateTileset(tileset3d) {
    const {timeline, viewport} = this.context;
    if (!timeline || !viewport || !tileset3d) {
      return;
    }
    tileset3d.update(viewport);
  }

  // `Layer` instances is created and added to the map if it doesn't exist yet.
  _updateLayerMap() {
    const {tileset3d, layerMap} = this.state;

    // create layers for new tiles
    const {tiles} = tileset3d;
    const tilesWithoutLayer = tiles.filter(tile => tile.selected && !layerMap[tile.id]);

    for (const tile of tilesWithoutLayer) {
      layerMap[tile.id] = {
        layer: this._create3DTileLayer(tile),
        tile
      };
    }

    // update layer visibility
    this._updateLayers();
  }

  // Grab only those layers who were selected this frame.
  _updateLayers() {
    const {layerMap} = this.state;
    const layerMapValues = Object.values(layerMap);

    for (const value of layerMapValues) {
      const {tile} = value;
      let {layer} = value;

      if (tile.selected) {
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
        throw new Error(`Tile3DLayer: Failed to render layer of type ${tileHeader.content.type}`);
    }
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

  _createSimpleMeshLayer(tileHeader) {
    const content = tileHeader.content;
    const {attributes, modelMatrix, cartographicOrigin, texture} = content;
    const {normals, texCoords} = attributes;
    const positions = new Float32Array(attributes.positions.value.length);
    for (let i = 0; i < positions.length; i += 3) {
      scratchOffset.copy(modelMatrix.transform(attributes.positions.value.subarray(i, i + 3)));
      positions.set(scratchOffset, i);
    }

    const geometry = new Geometry({
      drawMode: GL.TRIANGLES,
      attributes: {
        positions,
        normals,
        texCoords
      }
    });

    const SubLayerClass = this.getSubLayerClass('simplemesh', SimpleMeshLayer);

    return new SubLayerClass(
      this.getSubLayerProps({
        id: 'simplemesh'
      }),
      {
        id: `${this.id}-simplemesh-${tileHeader.id}`,
        mesh: geometry,
        data: [{}],
        getPosition: [0, 0, 0],
        getColor: [255, 255, 255],
        texture,
        coordinateOrigin: cartographicOrigin,
        coordinateSystem: COORDINATE_SYSTEM.METER_OFFSETS
      }
    );
  }

  renderLayers() {
    const {tileset3d, layerMap} = this.state;
    if (!tileset3d) {
      return null;
    }
    this._updateLayerMap();
    return Object.values(layerMap).map(layer => layer.layer);
  }
}

Tile3DLayer.layerName = 'Tile3DLayer';
Tile3DLayer.defaultProps = defaultProps;
