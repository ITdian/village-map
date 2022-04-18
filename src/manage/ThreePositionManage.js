/**
 * 管理threejs模型的位置
 */
/**
 * 设置模型的位置
 * @param object
 * @param position {lng: xxx, lat: xxx, height}
 */
function setModelPositionByJson(object, position){
    object.userData._position = position;
}

function setModelPositionByParams(object, lng, lat, height){
    let position = {lng: lng, lat: lat, height: height};
    setModelPositionByJson(object, position);
}

function getModelPosition(object){
    return object.userData._position;
}

/**
 * 设置模型是否需要换算mapbox的缩放， 一般设置group， 会处理group孩子节点的mesh的geometry的缩放
 * @param object
 */
function setModelScaleOption(object){
    object.userData._mapboxScale = true;
}
function getModelScaleOption(object){
    return object.userData._mapboxScale;
}
/**
 * 设置模型使用地形高度
 * @param object
 */
function setModelUseTerrainHeightOption(object, height){
    object.userData._useTerrain = true;
    object.userData._height = height;
}
function getModelUseTerrain(object){
    let useTerrain = object.userData._useTerrain;
    return useTerrain;
}
function getModelUseTerrainHeight(object){
    let height = object.userData._height;
    return height;
}


/**
 * 设置模型当前的地形高度
 * @param object
 */
function setModelElevationOption(object, elevation){
    object.userData._elevation = elevation;
}
function getModelElevationOption(object){
    return object.userData._elevation;
}

export {
    setModelPositionByJson,
    setModelPositionByParams,
    getModelPosition,
    setModelScaleOption,
    getModelScaleOption,
    setModelUseTerrainHeightOption,
    getModelUseTerrain,
    getModelUseTerrainHeight,
    setModelElevationOption,
    getModelElevationOption
}
