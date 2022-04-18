const threejsProperty = {
    scene: null,
    camera: null,
    renderer: null,
    mercatorWorld: null,
    worldParams: {
        lnglat: null,
        mercatorCoor: null,
        position: null,
        scale: null,
        changeTime: 1 * 1000,
        changeDistance: 5 * 10000,
        changeZoom: 8,     //map.transform.zoom > changeZoom才变更中心点
        lastChangeTime: new Date().getTime(),
        terrainChangeTime: new Date().getTime(),
    },
    cameraSync: null,
    worlds: [],
    classificationPrimitives: [],
    composer: null,     //效果组合器渲染
    lights: null,
    tilesetLayers: [],
    renderBoforeList: {},    //渲染前的操作
    highlightUtils: null,
    isDispose: false,
};
export default threejsProperty;
