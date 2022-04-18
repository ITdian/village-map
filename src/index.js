import * as THREE from 'three';
import mapboxgl from 'village-map';
import AgLayer from "./AgLayer.js";

const exported = {
    threejs: THREE,
    mapbox: mapboxgl,
    agLayer: AgLayer
};

export default exported;
