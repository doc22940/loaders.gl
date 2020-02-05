/* global TextDecoder,  __VERSION__ */ // __VERSION__ is injected by babel-plugin-version-inline

const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'latest';

import {parse3DTile} from './lib/parsers/parse-3d-tile';
import {path} from '@loaders.gl/core';
import {TILE_REFINEMENT, TILE_TYPE, TILESET_TYPE, LOD_METRIC_TYPE} from '@loaders.gl/tiles';

async function parseTile(arrayBuffer, options, context) {
  const tile = {};
  const byteOffset = 0;
  await parse3DTile(arrayBuffer, byteOffset, options, context, tile);
  return tile;
}

function getTileType(tile) {
  if (!tile.contentUrl) {
    return TILE_TYPE.EMPTY;
  }

  const contentUrl = tile.contentUrl;
  const fileExtension = contentUrl.split('.').pop();
  switch (fileExtension) {
    case 'pnts':
      return TILE_TYPE.POINTCLOUD;
    case 'i3dm':
    case 'b3dm':
      return TILE_TYPE.SCENEGRAPH;
    default:
      return fileExtension;
  }
}

function getBaseUri(tileset) {
  return path.dirname(tileset.url);
}

function getRefine(refine) {
  switch (refine) {
    case 'REPLACE':
    case 'replace':
      return TILE_REFINEMENT.REPLACE;
    case 'ADD':
    case 'add':
      return TILE_REFINEMENT.ADD;
    default:
      return refine;
  }
}

// normalize tile headers
function normalizeTileHeaders(tileset) {
  const basePath = tileset.basePath;
  const root = normalizeTileData(tileset.root, tileset);

  const stack = [];
  stack.push(root);

  while (stack.length > 0) {
    const tile = stack.pop();
    const children = tile.children || [];
    for (const childHeader of children) {
      normalizeTileData(childHeader, {basePath});
      stack.push(childHeader);
    }
  }

  return root;
}

function normalizeTileData(tile, options) {
  if (tile.content) {
    tile.contentUrl = `${options.basePath}/${tile.content.uri}`;
  }
  tile.id = tile.contentUrl;
  tile.lodMetricType = LOD_METRIC_TYPE.GEOMETRIC_ERROR;
  tile.lodMetricValue = tile.geometricError;
  tile.transformMatrix = tile.transform;
  tile.type = getTileType(tile);
  tile.refine = getRefine(tile.refine);
  return tile;
}

async function parseTileset(data, options, context) {
  const tilesetJson = JSON.parse(new TextDecoder().decode(data));
  // eslint-disable-next-line no-use-before-define
  tilesetJson.loader = Tiles3DLoader;
  tilesetJson.url = context.url;
  // base path that non-absolute paths in tileset are relative to.
  tilesetJson.basePath = getBaseUri(tilesetJson);
  tilesetJson.root = normalizeTileHeaders(tilesetJson);
  tilesetJson.type = TILESET_TYPE.TILES3D;

  tilesetJson.lodMetricType = LOD_METRIC_TYPE.GEOMETRIC_ERROR;
  tilesetJson.lodMetricValue = tilesetJson.root.lodMetricValue;

  return tilesetJson;
}

async function parse(data, options, context, loader) {
  // auto detect file type
  let isTileset;
  if ('isTileset' in options) {
    isTileset = options.isTileset;
  } else {
    isTileset = context.url && context.url.indexOf('.json') !== -1;
  }

  if (isTileset) {
    data = await parseTileset(data, options, context, loader);
  } else {
    data = await parseTile(data, options, context);
  }

  return data;
}

// Tiles3DLoader
const Tiles3DLoader = {
  id: '3d-tiles',
  name: '3D Tiles',
  version: VERSION,
  extensions: ['json', 'cmpt', 'pnts', 'b3dm', 'i3dm'],
  mimeType: 'application/octet-stream',
  test: ['json', 'cmpt', 'pnts', 'b3dm', 'i3dm'],
  parse,
  options: {
    '3d-tiles': {
      loadGLTF: true,
      decodeQuantizedPositions: false
    }
  }
};

export default Tiles3DLoader;
