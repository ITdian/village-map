/**
 * 火灾分析功能
 * @author lidy
 * @since 2022-03-09
 * 1、通过经纬度添加火灾点位
 * 2、添加火灾特效
 * 3、添加火灾影响范围效果
 *
 * *  使用方法：
 * let fireAnalysis = new FireAnalysis();
 * fireAnalysis.addFirePointByLnglat(lng, lat, height);
 * 或者
 * fireAnalysis.addFirePointByThreeCoor(point);
 */


import * as THREE from 'three';

import CoorTransformUtils from "../utils/CoorTransformUtils";
const coorTransformUtils = new CoorTransformUtils();
import threejsProperty from "../manage/threejsProperty";

import {RadarMesh} from "../effect/ThreejsRadarMesh";

import FireEffectUtils from "../effect/FireEffectUtils";
let fireEffectUtils = null;

import ResourceTracker from "../utils/resourceTracker";
// 定义resMgr和track用来清理three
let resMgr = new ResourceTracker();

class FireAnalysis {
    constructor() {
        this.world = null;
        this.worldName = "fireAnalysis-" + new Date().getTime();
        this.group = null;

        this.init();
    }

    init() {
        this.createWorldGroup();
        fireEffectUtils = new FireEffectUtils();
        fireEffectUtils.createFireEffectObject(threejsProperty.renderer, threejsProperty.camera, threejsProperty.scene);
        setTimeout(() => {
            fireEffectUtils.setActive(false);
        }, 100)
        setTimeout(() => {
            fireEffectUtils.setActive(true);
        }, 100)
    }

    /**
     * 销毁
     */
    dispose() {
        this.clear();
        this.removeWorldGroup();

    }

    clear(){
        this.removeFireEffectUtils();
    }

    removeFireEffectUtils(){
        if(fireEffectUtils){
            fireEffectUtils.setActive(false);
            fireEffectUtils.dispose();
            fireEffectUtils = null;
        }
    }

    /**
     * 通过经纬度和高度， 添加火灾点
     * @param lng
     * @param lat
     * @param height
     */
    addFirePointByLnglat(lng, lat, height){
        // 经纬度转threejs坐标
        let localVector = coorTransformUtils.wgs84ToThreeLocal(lng, lat, height);
        this.addFirePointByThreeCoor(localVector);
    }


    /**
     * 通过threejs坐标系添加火灾点
     * @param pointVector
     */
    addFirePointByThreeCoor(pointVector){
        let group = new THREE.Group();
        group.position.copy(pointVector);
        this.world.add(group);

        let geometry = new THREE.CircleGeometry( 10, 32 );
        geometry.rotateX(-Math.PI / 2);
        let radarMesh = new RadarMesh(geometry, {color: 0xdd0000, speed: 3});
        group.add( radarMesh );

        //添加火焰特效
        let fireEffect = fireEffectUtils.createFireEffectObject(threejsProperty.renderer, threejsProperty.camera, threejsProperty.scene);
        group.add(fireEffect);
        //todo: 添加影响范围


    }

    /**
     * 移除所有的火灾点
     */
    removeAllFire(){
        this.world.clear()
    }


    //创建world用于绘制
    createWorldGroup(){
        if(!this.world){
            this.world = new THREE.Group();
            this.world.name = this.worldName;
            threejsProperty.mercatorWorld.add(this.world);
            threejsProperty.worlds.push(this.world);
        }
    }
    getWorldGroup(){
        return this.world;
    }
    //移除world, 销毁时调用
    removeWorldGroup(){
        if(this.world){
            for(let index in threejsProperty.worlds){
                let world = threejsProperty.worlds[index];
                if(world == this.world){     //移除当前绘制图层
                    threejsProperty.worlds.splice(index, 1)
                    break;
                }
            }
            // 完全销毁world
            resMgr.track(this.world);
            resMgr.dispose();
            this.world = null;
        }
    }
}

export default FireAnalysis;

