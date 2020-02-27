const VIEW_STATE = {
  height: 600,
  width: 800,
  pitch: 45,
  maxPitch: 60,
  bearing: 0,
  minZoom: 2,
  maxZoom: 30,
  zoom: 14.5
};

export const EXAMPLES = {
  SanFrancisco_Bldgs: {
    name: 'San Francisco',
    url: 'https://tiles.arcgis.com/tiles/z2tnIkrLQ2BRzr6P/arcgis/rest/services/SanFrancisco_Bldgs/SceneServer/layers/0',
    viewport: {
      ...VIEW_STATE,
      longitude: -120,
      latitude: 34
    }
  },
  New_York_Buildings: {
    name: 'New York',
    url: 'https://tiles.arcgis.com/tiles/z2tnIkrLQ2BRzr6P/arcgis/rest/services/New_York_Buildings/SceneServer/layers/0',
    viewport: {
      ...VIEW_STATE,
      longitude: -74,
      latitude: 40
    }
  }
};

//philadelphia_Bldgs_text
//Textured&Untextured
//'https://urldefense.proofpoint.com/v2/url?u=https-3A__tiles.arcgis.com_tiles_z2tnIkrLQ2BRzr6P_arcgis_rest_services_philadelphia-5FBldgs-5Ftext-5Funtex_SceneServer_layers_0&d=DwIGAg&c=r2dcLCtU9q6n0vrtnDw9vg&r=uUft2jfAcssCZvs7TNFSSg&m=_cRfm773wKwaQfY-gwJnmnFhdfAc2w6eiJ0365x2msY&s=JSwo9eTTG3Pxwevj25groHWmKSPS5IJAB6lzSIoo_ns&e= ';
// Texturedonly
//New_York_Buildings
// const TEST_DATA_URL =
//   'https://tiles.arcgis.com/tiles/z2tnIkrLQ2BRzr6P/arcgis/rest/services/philadelphia_Bldgs_text_tex_untex_sub/SceneServer/layers/0';

/* */
//NY
/*
const INITIAL_VIEW_STATE = {
 longitude: -73.97785639190995,
 latitude: 40.75262236078426,
 height: 600,
 width: 800,
 pitch: 45,
 maxPitch: 60,
 bearing: 0,
 minZoom: 2,
 maxZoom: 30,
 zoom: 14.5
};
*/

//philadelphia_Bldgs_text
/*
const INITIAL_VIEW_STATE = {
  longitude: -75.16725679895995,
  latitude: 39.95667467886362,
  height: 600,
  width: 800,
  pitch: 45,
  maxPitch: 60,
  bearing: 0,
  minZoom: 2,
  maxZoom: 30,
  zoom: 14.5
};
 */
