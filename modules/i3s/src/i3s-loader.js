/* global fetch, TextDecoder,  __VERSION__ */ // __VERSION__ is injected by babel-plugin-version-inline

const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'latest';

import {Ellipsoid} from '@math.gl/geospatial';
import {Vector3} from '@math.gl/core';

import {load} from '@loaders.gl/core';
import {ImageLoader} from '@loaders.gl/images';
import {TILE_TYPE, TILE_REFINEMENT, TILESET_TYPE} from '@loaders.gl/tiles';
import {parseI3SNodeGeometry} from './lib/parsers/parse-i3s-node-geometry';

const TILESET_REGEX = /layers\/[0-9]+$/;
const TILE_HEADER_REGEX = /nodes\/([0-9-]+|root)$/;

const scratchCenter = new Vector3();

async function parseTileContent(arrayBuffer, options, context) {
  const tileHeader = options.tile;

  tileHeader.content = {};
  tileHeader.content.featureData = {};

  const featureData = await fetch(tileHeader.featureUrl).then(resp => resp.json());
  const geometryBuffer = await fetch(tileHeader.contentUrl).then(resp => resp.arrayBuffer());
  if (tileHeader.textureUrl) {
    tileHeader.content.texture = await load(tileHeader.textureUrl, ImageLoader);
  }

  tileHeader.content.featureData = featureData;
  parseI3SNodeGeometry(geometryBuffer, tileHeader);

  return tileHeader.content;
}

function normalizeTileData(tile, options, context) {
  tile.url = context.url;

  if (tile.featureData) {
    tile.featureUrl = `${tile.url}/${tile.featureData[0].href}`;
  }
  if (tile.geometryData) {
    tile.contentUrl = `${tile.url}/${tile.geometryData[0].href}`;
  }
  if (tile.textureData) {
    tile.textureUrl = `${tile.url}/${tile.textureData[0].href}`;
  }

  scratchCenter.copy(tile.mbs);
  const centerCartesian = Ellipsoid.WGS84.cartographicToCartesian(tile.mbs.slice(0, 3));
  tile.boundingVolume = {
    sphere: [...centerCartesian, tile.mbs[3]]
  };
  tile.lodMetricType = tile.lodSelection[0].metricType;
  tile.lodMetricValue = tile.lodSelection[0].maxError;
  tile.transformMatrix = tile.transform;
  tile.type = TILE_TYPE.SIMPLEMESH;
  // TODO only support replacement for now
  tile.refine = TILE_REFINEMENT.REPLACE;
  return tile;
}

async function parseTileset(data, options, context) {
  const tilesetJson = JSON.parse(new TextDecoder().decode(data));
  // eslint-disable-next-line no-use-before-define
  tilesetJson.loader = I3SLoader;
  tilesetJson.url = context.url;

  const rootNodeUrl = `${tilesetJson.url}/nodes/root`;
  // eslint-disable-next-line no-use-before-define
  tilesetJson.root = await load(rootNodeUrl, I3SLoader, {isHeader: true});

  // base path that non-absolute paths in tileset are relative to.
  tilesetJson.basePath = tilesetJson.url;
  tilesetJson.type = TILESET_TYPE.I3S;

  // populate from root node
  tilesetJson.lodMetricType = tilesetJson.root.lodMetricType;
  tilesetJson.lodMetricValue = tilesetJson.root.lodMetricValue;

  return tilesetJson;
}

const I3SLoader = {
  id: 'i3s tiles',
  name: 'I3S 3D Tiles',
  version: VERSION,
  extensions: ['json', 'bin'],
  mimeType: 'application/octet-stream',
  parse,
  options: {}
};

async function parseTile(data, options, context) {
  data = JSON.parse(new TextDecoder().decode(data));
  const tile = normalizeTileData(data, options, context);
  return tile;
}

async function parse(data, options, context, loader) {
  // auto detect file type based on url
  let isTileset;
  if ('isTileset' in options) {
    isTileset = options.isTileset;
  } else {
    isTileset = TILESET_REGEX.test(context.url);
  }

  let isTileHeader;
  if ('isTileHeader' in options) {
    isTileHeader = options.isTileHeader;
  } else {
    isTileHeader = TILE_HEADER_REGEX.test(context.url);
  }

  if (isTileset) {
    data = await parseTileset(data, options, context, loader);
  } else if (isTileHeader) {
    data = await parseTile(data, options, context);
    if (options.loadContent) {
      options.tile = data;
      await load(data.contentUrl, I3SLoader, options);
    }
  } else {
    data = await parseTileContent(data, options, context);
  }

  return data;
}

export default I3SLoader;
