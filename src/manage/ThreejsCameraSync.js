import * as THREE from "three";
import {
    getModelElevationOption,
    getModelPosition,
    getModelUseTerrain,
    getModelUseTerrainHeight, setModelElevationOption,
    setModelPositionByJson
} from "./ThreePositionManage";

import CoorTransformUtils from "../utils/CoorTransformUtils";

/**
 * 同步mapbox相机与threejs相机的一致性
 */

const MERCATOR_A = 6378137.0;
const WORLD_SIZE = MERCATOR_A * Math.PI * 2;

const ThreeboxConstants = {
    WORLD_SIZE: WORLD_SIZE,
    PROJECTION_WORLD_SIZE: WORLD_SIZE / (MERCATOR_A * Math.PI * 2),
    MERCATOR_A: MERCATOR_A,
    DEG2RAD: Math.PI / 180,
    RAD2DEG: 180 / Math.PI,
    EARTH_CIRCUMFERENCE: 40075000 // In meters
};

const modelRotate = [Math.PI / 2, 0, 0];
class ThreejsCameraSync{
    constructor(map, threejsProperty) {
        this.map = map;
        this.threejsProperty = threejsProperty;
        this.camera = threejsProperty.camera;
        this.coorTransformUtils = new CoorTransformUtils();

        this.viewProjectionMatrix = null;
        this.active = true;
        this.updateCallback = null;
        this.camera.matrixAutoUpdate = false; // We're in charge of the camera now!

        //set up basic camera state
        this.state = {
            fov: 0.6435011087932844, // Math.atan(0.75);
            translateCenter: new THREE.Matrix4(),
            worldSizeRatio: 512 / ThreeboxConstants.WORLD_SIZE
        };

        this.state.translateCenter.makeTranslation(
            ThreeboxConstants.WORLD_SIZE / 2,
            -ThreeboxConstants.WORLD_SIZE / 2,
            0
        );

        this.setupCamera();
    }
    setupCamera() {
        let transform = this.map.transform;

        this.state.cameraToCenterDistance = transform.cameraToCenterDistance;
        this.state.cameraTranslateZ = new THREE.Matrix4().makeTranslation(0, 0, transform.cameraToCenterDistance);

        this.updateCamera();
    }
    updateCamera() {
        if (!this.camera) {
            console.log('nocamera');
            return;
        }
        if(!this.viewProjectionMatrix){
            // console.log('no viewProjectionMatrix');
            return;
        }
        let threejsProperty = this.threejsProperty;
        if(!threejsProperty.worldParams.scale){
            return;
        }
        //判断修改threejs的原点位置
        this.changeThreeOrigin();
        //判断修改使用地形高度
        this.changeTerrainHeight();


        let modelTransform = {
            translateX: threejsProperty.worldParams.mercatorCoor.x,
            translateY: threejsProperty.worldParams.mercatorCoor.y,
            translateZ: threejsProperty.worldParams.mercatorCoor.z,
            rotateX: modelRotate[0],
            rotateY: modelRotate[1],
            rotateZ: modelRotate[2],
            /* Since our 3D model is in real world meters, a scale transform needs to be
             * applied since the CustomLayerInterface expects units in MercatorCoordinates.
             */
            scale: threejsProperty.worldParams.scale,
        };

        let rotationX = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), modelTransform.rotateX);
        let rotationY = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(0, 1, 0), modelTransform.rotateY);
        let rotationZ = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(0, 0, 1), modelTransform.rotateZ);

        let matrix = new THREE.Matrix4().fromArray(this.viewProjectionMatrix);
        let matrixTransformation = new THREE.Matrix4()
            .makeTranslation(modelTransform.translateX, modelTransform.translateY, modelTransform.translateZ)
            .scale(new THREE.Vector3(modelTransform.scale, -modelTransform.scale, modelTransform.scale))
            .multiply(rotationX)
            .multiply(rotationY)
            .multiply(rotationZ);

        let projectionMatrix = matrix.multiply(matrixTransformation);


        // 计算相机当前位置的position
        let transform = this.map.transform;
        //threejs中为X轴向右, Y轴向上, Z轴向屏幕外;  mapbox中为X轴向右, Y轴向上, Z轴向屏幕内
        let cameraMapboxMercator = new THREE.Vector3(
            transform._camera.position[0] / threejsProperty.worldParams.scale,
            transform._camera.position[2] / threejsProperty.worldParams.scale,
            transform._camera.position[1] / threejsProperty.worldParams.scale,
        )

        this.cameraPosition = cameraMapboxMercator.clone();

        //移动当前相机在threejs中世界坐标中的位置以及角度
        let threeOrigin = new THREE.Vector3(threejsProperty.worldParams.position.x, threejsProperty.worldParams.position.y, threejsProperty.worldParams.position.z);
        let cameraThreePosition = cameraMapboxMercator.sub(threeOrigin);

        let cameraMatrix = new THREE.Matrix4().setPosition(cameraThreePosition.x, cameraThreePosition.y, cameraThreePosition.z);

        //计算相机角度（ 水面效果在相机垂直时，不知道旋转角度）
        let cameraMatrix1;
        if(this.map.getPitch() == 0){  //判断是否存在垂直的相机角度
            cameraMatrix1 = new THREE.Matrix4().lookAt(new THREE.Vector3(0,1,0), new THREE.Vector3(), new THREE.Vector3(0,1,0)); //默认为垂直从上往下看

            let bearing = this.map.getBearing();
            // 处理绕Y轴的旋转角度
            let rotationY = new THREE.Matrix4().makeRotationY(- Math.PI * bearing / 180);
            cameraMatrix1.premultiply(rotationY)
        }else{
            let elevation = this.map.queryTerrainElevation(transform.center, { exaggerated: false });
            let centerVector = this.coorTransformUtils.wgs84ToThreeLocal(transform.center.lng, transform.center.lat, elevation ? elevation : 0);

            centerVector.sub(threeOrigin);
            cameraMatrix1 = new THREE.Matrix4().lookAt(cameraThreePosition, centerVector, new THREE.Vector3(0,1,0));
        }
        this.camera.position.copy(cameraThreePosition);
        cameraMatrix.multiply(cameraMatrix1);

        this.camera.matrix.copy(cameraMatrix);
        this.camera.matrixWorld.copy(cameraMatrix);
        this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
        //重新计算位置移动后的投影矩阵
        projectionMatrix.multiply(this.camera.matrixWorld);

        this.camera.projectionMatrix = projectionMatrix;
        this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();

        this.frustum = new THREE.Frustum();
        this.frustum.setFromProjectionMatrix(
            new THREE.Matrix4().multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse)
        );

        if (this.updateCallback) {
            this.updateCallback();
        }
    }

    /**
     * 变更threejs世界坐标的原点
     */
    changeThreeOrigin(){
        let threejsProperty = this.threejsProperty;
        if(threejsProperty){
            if(threejsProperty.worldParams.changeZoom < this.map.transform.zoom
                && threejsProperty.worldParams.changeTime + threejsProperty.worldParams.lastChangeTime < new Date().getTime()){

                let transform = this.map.transform;
                let mapboxMercatorObj = this.coorTransformUtils.wgs84ToMapboxMercator(transform.center.lng, transform.center.lat);
                let worldScale = mapboxMercatorObj.scale;
                let worldPosition = this.coorTransformUtils.wgs84ToThreeLocal(transform.center.lng, transform.center.lat, 0, worldScale);
                let worldMercatorCoor = {x: mapboxMercatorObj.x, y: mapboxMercatorObj.y, z: mapboxMercatorObj.z};
                let distance = worldPosition.distanceTo(threejsProperty.worldParams.position);
                if(threejsProperty.worldParams.changeDistance < distance){

                    //设置最后变更时间
                    threejsProperty.worldParams.lastChangeTime = new Date().getTime();

                    //计算两个中心点scale缩放比的比率
                    let scaleRatio = threejsProperty.worldParams.scale / worldScale;         //  旧的scale/新的scale
                    //变更中心点位置
                    threejsProperty.worldParams.lnglat = transform.center;
                    threejsProperty.worldParams.scale = worldScale;
                    threejsProperty.worldParams.position = worldPosition;
                    threejsProperty.worldParams.mercatorCoor = worldMercatorCoor;


                    //变更整体world的位置
                    if(threejsProperty.mercatorWorld){
                        threejsProperty.mercatorWorld.position.copy(new THREE.Vector3(-worldPosition.x, -worldPosition.y, -worldPosition.z));
                    }
                    // 变更场景中的每一个模型的伪墨卡托坐标
                    for(let world_ of threejsProperty.mercatorWorld.children){
                        if(world_.children){
                            for(let child_ of world_.children){
                                //方案1： 通过经纬度重新设置伪墨卡托坐标
                                /*if(getModelPosition(child_)){
                                    let position = getModelPosition(child_);
                                    //获取mapbox伪墨卡托坐标
                                    let localVector = this.coorTransformUtils.wgs84ToThreeLocal(position.lng, position.lat, position.height);
                                    child_.position.copy(localVector);
                                }*/
                                //方案2： 通过缩放比比率计算
                                if(child_.position.x && child_.position.z){
                                    child_.position.multiplyScalar(scaleRatio);
                                }
                            }
                        }
                    }

                }
            }
        }
    }

    /**
     * 变更地形高度
     */
    changeTerrainHeight(){
        let threejsProperty = this.threejsProperty;
        if(threejsProperty && this.map.getTerrain()){
            let changeTime = 1000;
            if(new Date().getTime() - threejsProperty.worldParams.terrainChangeTime > changeTime){
                threejsProperty.worldParams.terrainChangeTime = new Date().getTime();
                // 变更场景中的每一个模型的地形高度
                for(let world_ of threejsProperty.mercatorWorld.children){
                    if(world_.children){
                        for(let child_ of world_.children){
                            if(getModelUseTerrain(child_)){
                                let height = getModelUseTerrainHeight(child_);
                                let position = getModelPosition(child_);
                                if(!position){
                                    position = this.coorTransformUtils.threeLocalToWgs84(child_.position);
                                    setModelPositionByJson(child_, position);
                                }
                                //获取地形高度
                                let elevation = this.map.queryTerrainElevation(position, { exaggerated: false });
                                elevation = elevation ? elevation : 0;

                                if((elevation == 0 && getModelElevationOption(child_)) || elevation == getModelElevationOption(child_)){
                                    continue;
                                }
                                setModelElevationOption(child_, elevation);
                                let localVector = this.coorTransformUtils.wgs84ToThreeLocal(position.lng, position.lat, elevation + height);
                                // child_.position.copy(localVector);
                                child_.position.y = localVector.y;
                                //标记3dtilesLayer已经修改了模型高程
                                let layer = this.get3DTilesLayerByMesh(child_);
                                if(layer){
                                    layer.terrainHeightChange = true;
                                }
                            }
                        }
                    }
                }
                //变更classificationPrimitive的位置信息
                for(let classificationPrimitive of threejsProperty.classificationPrimitives){
                    classificationPrimitive.refreshThreePosition();
                }
            }
        }
    }

    //通过mesh获取所属的图层
    get3DTilesLayerByMesh(meshObject){
        let layerId = null;
        if(meshObject){
            recursion(meshObject);
        }
        if(layerId){
            let layer = this.map.getLayer(layerId)
            return layer && layer.implementation
        }

        function recursion(_object){
            if(_object && _object.userData && _object.userData.tileType){
                let rootObject = _object;
                if(rootObject.parent){
                    let parent = rootObject.parent;
                    layerId = parent.name;
                }
            }else if(_object.parent){
                recursion(_object.parent);
            }
        }
    }
}

export default ThreejsCameraSync;
