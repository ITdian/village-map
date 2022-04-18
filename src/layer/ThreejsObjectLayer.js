import * as THREE from "three";
import CoorTransformUtils from "../utils/CoorTransformUtils";
import {setModelUseTerrainHeightOption} from "../manage/ThreePositionManage";

import ResourceTracker from "../utils/resourceTracker";
// 定义resMgr和track用来清理three
let resMgr = new ResourceTracker();
const track = resMgr.track.bind(resMgr);
/**
 * 加载threejs的object的图层
 */

class ThreejsObjectLayer{
    constructor(layerId, threejsProperty) {
        this.id = layerId;
        this.threejsProperty = threejsProperty;
        this.world = null;
        this.defaultWorldName = "threejsObject_";
        this.worldName = this.defaultWorldName + layerId;

        this.objectIds = {};

        this.coorTransformUtils = new CoorTransformUtils();

        //初始化
        this.createWorldGroup();
    }

    /**
     * 通过经纬度添加gltf模型到地图中
     * @param object
     * @param lng
     * @param lat
     * @param height
     * @param noCastShadow 不添加阴影
     * @param useTerrainHeight 是否使用地形高度
     */
    addObjectByLngLat(object, id, lng, lat, height, noCastShadow = true, useTerrainHeight = true){
        if(object && lng && lat){
            height = height ? height : 0;
            let pointPosition = this.coorTransformUtils.wgs84ToThreeLocal(lng, lat, height);
            this.addObjectByThreeLocal(object, id,pointPosition.x, pointPosition.y, pointPosition.z, noCastShadow, useTerrainHeight);
        }
    }
    /**
     * 通过墨卡托位置添加gltf模型到地图中
     * @param object
     * @param x
     * @param y
     * @param z
     * @param noCastShadow 不添加阴影
     */
    addObjectByMercator(object, id, x, y, z = 0, noCastShadow = true, useTerrainHeight = true ){
        if(object && x && y){
            let pointPosition = this.coorTransformUtils.mercatorToThreeLocal(x, y, z);
            this.addObjectByThreeLocal(object, id, pointPosition.x, pointPosition.y, pointPosition.z, noCastShadow, useTerrainHeight);
        }
    }

    /**
     * 通过threejs局部位置添加gltf模型到地图中
     * @param object
     * @param x
     * @param y
     * @param z
     * @param noCastShadow 不添加阴影
     */
    addObjectByThreeLocal(object, id, x, y, z = 0, noCastShadow = true, useTerrainHeight = true){
        if(object && x && z){
            //处理id
            if(this.getObjectById(id)){
                console.error(`object图层(${this.id})已经存在改objectId:` + id);
                return;
            }
            this.objectIds[id] = object;
            object.userData.id = id;

            if(useTerrainHeight){
                setModelUseTerrainHeightOption(object, y);
            }
            this.world.add( object );
            //添加阴影
            if(!noCastShadow){
                this.addCastShadow(object);
            }

            //实际位置
            let position = new THREE.Vector3(x, y, z);

            //计算缩放
            let scaleVector = new THREE.Vector3().setFromMatrixScale(this.threejsProperty.mercatorWorld.matrix.clone());
            object.scale.copy(scaleVector);

            let originMatrix = new THREE.Matrix4().copy(this.threejsProperty.mercatorWorld.matrix).invert();
            //计算偏移量
            let originPosition = new THREE.Vector3().setFromMatrixPosition(originMatrix);    //原点位置
            let tranformsVector = new THREE.Vector3().subVectors(position, originPosition);
            //计算偏移量的缩放
            let ScaleMatrix = new THREE.Matrix4().makeScale(scaleVector.x, scaleVector.y, scaleVector.z);
            tranformsVector.applyMatrix4(ScaleMatrix);

            let tranformsMatrix = new THREE.Matrix4().setPosition(tranformsVector);
            originMatrix.multiply(tranformsMatrix);
            //矩阵应用到object
            object.applyMatrix4(originMatrix.clone());
            this.threejsProperty.cameraSync.updateCamera();
        }
    }


    //销毁
    destroy(){
        this.removeWorldGroup();
        this.threejsProperty.cameraSync.updateCamera();
    }

    /**
     * 通过id获取多边形
     * @param id
     */
    getObjectById(id){
        if(id && this.objectIds[id]){
            return this.objectIds[id];
        }
    }
    removeObjectById(id){
        let object = this.getObjectById(id);
        if(object){
            delete this.objectIds[id];
            track(object)
            resMgr && resMgr.dispose()
            this.threejsProperty.cameraSync.updateCamera();
        }
    }
    removeAll(){
        for(let id in this.objectIds){
            this.removeObjectById(id);
        }
    }

    //创建world用于绘制
    createWorldGroup(){
        if(!this.world){
            this.world = new THREE.Group();
            this.world.name = this.worldName;
            this.threejsProperty.mercatorWorld.add(this.world);
            this.threejsProperty.worlds.push(this.world);
        }
    }
    //移除world, 销毁时调用
    removeWorldGroup(){
        if(this.world){
            for(let index in this.threejsProperty.worlds){
                let world = this.threejsProperty.worlds[index];
                if(world == this.world){     //移除当前绘制图层
                    this.threejsProperty.worlds.splice(index, 1)
                    break;
                }
            }
            track(this.world)
            resMgr && resMgr.dispose()
            this.threejsProperty.mercatorWorld.remove(this.world);
            this.world = null;
        }
    }

    //添加产生阴影
    addCastShadow(object){
        if(object){
            if(object instanceof THREE.Mesh){
                object.castShadow = true;
            }
            if(object.children && object.children.length > 0){
                for(let child of object.children){
                    this.addCastShadow(child);
                }
            }
        }
    }
    removeCastShadow(object){
        if(object){
            if(object instanceof THREE.Mesh){
                object.castShadow = false;
            }
            if(object.children && object.children.length > 0){
                for(let child of object.children){
                    this.removeCastShadow(child);
                }
            }
        }
    }
}
export default ThreejsObjectLayer;
