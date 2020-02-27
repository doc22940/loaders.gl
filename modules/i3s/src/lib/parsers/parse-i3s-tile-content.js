/* global fetch */

import {Vector3, Matrix4} from '@math.gl/core';
import {Ellipsoid} from '@math.gl/geospatial';
import GL from '@luma.gl/constants';

import {load} from '@loaders.gl/core';
import {ImageLoader} from '@loaders.gl/images';

const TYPE_ARRAY_MAP = {
  UInt8: Uint8Array,
  Float32: Float32Array
};

const GL_TYPE_MAP = {
  UInt8: GL.UNSIGNED_BYTE,
  Float32: GL.FLOAT
};

const scratchVector = new Vector3([0, 0, 0]);

export async function parseI3STileContent(arrayBuffer, tile) {
  tile.content = tile.content || {};
  tile.content.featureData = {};

  const featureData = await fetch(tile.featureUrl).then(resp => resp.json());
  const geometryBuffer = await fetch(tile.contentUrl).then(resp => resp.arrayBuffer());
  if (tile.textureUrl) {
    tile.content.texture = await load(tile.textureUrl, ImageLoader);
  }

  tile.content.featureData = featureData;

  parseI3SNodeGeometry(geometryBuffer, tile);
}

/* eslint-disable max-statements */
export function parseI3SNodeGeometry(arrayBuffer, tile = {}) {
  if (!tile.content) {
    return tile;
  }

  const content = tile.content;
  const {featureData} = content;
  const geometryData = featureData.geometryData[0];
  const {
    params: {vertexAttributes}
  } = geometryData;

  const {vertexCount, attributes} = normalizeAttributes(arrayBuffer, vertexAttributes);

  const {enuMatrix, cartographicOrigin, cartesianOrigin} = parsePositions(
    attributes.position,
    tile
  );

  const matrix = new Matrix4(geometryData.transformation).multiplyRight(enuMatrix);

  content.attributes = {
    positions: attributes.position,
    normals: attributes.normal,
    colors: attributes.color,
    texCoords: attributes.uv0
  };

  content.vertexCount = vertexCount;
  content.cartographicCenter = cartographicOrigin;
  content.cartesianOrigin = cartesianOrigin;
  content.modelMatrix = matrix.invert();
  content.byteLength = arrayBuffer.byteLength;

  return tile;
}

/* eslint-enable max-statements */

function normalizeAttributes(buffer, vertexAttributes) {
  const attributes = {};
  let vertexCount = 0;
  for (const attribute in vertexAttributes) {
    const {byteOffset, count, valueType, valuesPerElement} = vertexAttributes[attribute];
    const TypedArrayType = TYPE_ARRAY_MAP[valueType];

    const value = new TypedArrayType(buffer, byteOffset, count * valuesPerElement);
    attributes[attribute] = {
      value,
      type: GL_TYPE_MAP[valueType],
      size: valuesPerElement
    };

    if (attribute === 'position') {
      vertexCount = count / 3;
    }
    if (attribute === 'color') {
      attributes.color.normalized = true;
    }
  }

  return {vertexCount, attributes};
}

function parsePositions(attribute, tile) {
  const mbs = tile.mbs;
  const value = attribute.value;

  const minHeight = value
    .filter((coordinate, index) => (index + 1) % 3 === 0)
    .reduce((accumulator, currentValue) => Math.min(accumulator, currentValue), Infinity);

  const enuMatrix = new Matrix4();
  const cartographicOrigin = new Vector3(mbs[0], mbs[1], -minHeight);
  const cartesianOrigin = new Vector3();
  Ellipsoid.WGS84.cartographicToCartesian(cartographicOrigin, cartesianOrigin);
  Ellipsoid.WGS84.eastNorthUpToFixedFrame(cartesianOrigin, enuMatrix);
  attribute.value = offsetsToCartesians(value, cartographicOrigin);

  return {
    enuMatrix,
    cartographicOrigin,
    cartesianOrigin
  };
}

function offsetsToCartesians(vertices, cartographicOrigin) {
  const positions = new Float64Array(vertices.length);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = vertices[i] + cartographicOrigin.x;
    positions[i + 1] = vertices[i + 1] + cartographicOrigin.y;
    positions[i + 2] = vertices[i + 2] + cartographicOrigin.z;
  }

  for (let i = 0; i < positions.length; i += 3) {
    Ellipsoid.WGS84.cartographicToCartesian(positions.subarray(i, i + 3), scratchVector);
    positions[i] = scratchVector.x;
    positions[i + 1] = scratchVector.y;
    positions[i + 2] = scratchVector.z;
  }

  return positions;
}
