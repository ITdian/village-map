/**
 * 淹没分析功能
 * @author lidy
 * @since 2022-03-04
 * 1、通过经纬度数组绘制水面
 * 2、水体侧面4个面需要绘制半透明面片
 * 3、水面高度根据模拟变化
 * 4、获取水体内部的模型， 根据水深添加颜色（待定）
 *
 * *  使用方法：
 * let floodAnalysis = new FloodAnalysis();
 * floodAnalysis.setParams(params);
 * floodAnalysis.setPolygonPaths([[lng, lat], [lng1, lat1], ...]);
 * floodAnalysis.startFloodSimulate();
 */


import * as THREE from 'three';
import CoorTransformUtils from "../utils/CoorTransformUtils";
const coorTransformUtils = new CoorTransformUtils();
import threejsProperty from "../manage/threejsProperty";

import {Water} from '../effect/ThreejsWater'
import waterNormalMap0 from '../assets/texture/Water_1_M_Normal.jpg';
import waterNormalMap1 from '../assets/texture/Water_2_M_Normal.jpg';

import ResourceTracker from "../utils/resourceTracker";
// 定义resMgr和track用来清理three
let resMgr = new ResourceTracker();

class FloodAnalysis {
    constructor() {
        this.world = null;
        this.worldName = "floodAnalysis-" + new Date().getTime();
        this.group = null;
        this.waterPlane = null;

        //基本参数
        this.params = {
            defalutHeight: 0,    //海拔高度(米)
            minHeight: 0,        //最小高度(米)
            maxHeight: 10,       //最大高度(米)
            floodSpeed: 1,       //淹没速度(米/秒)
            currentHeight: 0,    //当前水位(米)
        };

        this.centerVector = null;
        this.polygon = {
            positions: null,        //经纬度坐标
            threePositions: null,   //threejs坐标
        };

        this.waterParams = {
            color: 0x85d4fd,
            lightColor: 0xFFFFFF
        }

        //水淹模拟参数
        this.simulateParams = {
            timeoutIndex: null,
            timeoutInterval: 100,    //0.1s
            floodSpeed: 0.1,         //每次执行，淹没速度
            startStatus: false,      //开始状态
        }

        //监听当前水位变化的事件
        this.currentHeightHandle = null;

        this.init();
    }

    init() {
        this.createWorldGroup();
    }

    /**
     * 销毁
     */
    dispose() {
        this.removeCurrentHeightHandle();
        this.clear();
        this.removeWorldGroup();
    }

    clear(){

    }

    /**
     * 设置多边形的点集
     * @param paths [[lng, lat], [lng1, lat1], ...]
     */
    setPolygonPaths(paths){
        this.polygon.positions = paths;
        // 计算threejs的坐标列表
        let threePositinos = [];
        for(let path of paths){
            let localVector = coorTransformUtils.wgs84ToThreeLocal(path[0], path[1]);
            threePositinos.push([localVector.x, localVector.z]);
        }
        this.polygon.threePositions = threePositinos;

        // 更新水体位置
        this._updateWaterObject(true);
    }

    /**
     * 设置基本参数的值
     * @param params
     */
    setParams(params){
        if(params){
            for(let key in params){
                if(this.params.hasOwnProperty(key)){
                    this.params[key] = params[key];
                }
            }
            // 更新水体位置
            this._updateWaterObject();
        }
    }

    /**
     * 开始淹没分析模拟
     */
    startFloodSimulate(){
        // 定时器执行
        this.stopFloodSimulate();

        if(this.params.currentHeight == this.params.maxHeight){
            this.params.currentHeight = this.params.minHeight;
        }
        this.simulateParams.floodSpeed = this.params.floodSpeed / (1000 / this.simulateParams.timeoutInterval);

        this.simulateParams.startStatus = true;
        this.floodSimulate();
    }

    floodSimulate(){
        this.simulateParams.timeoutIndex = setTimeout(() => {
            // 修改当前水位
            this.params.currentHeight += this.simulateParams.floodSpeed;
            this.params.currentHeight = parseFloat(this.params.currentHeight.toFixed(2))
            this.triggerCurrentHeightHandle();

            if(this.params.currentHeight > this.params.maxHeight){
                this.params.currentHeight = this.params.maxHeight;
                // 更新水体位置
                this._updateWaterObject();
                // 达到最高水位， 退出模拟
                this.stopFloodSimulate();
                return;
            }

            // 更新水体位置
            this._updateWaterObject();
            // 定时执行
            this.floodSimulate();
        }, this.simulateParams.timeoutInterval)
    }

    /**
     * 监听当前水位变化， 模拟变化时触发
     * @param eventFunc 监听事件
     */
    watchCurrentHeightHandle(eventFunc){
        if(eventFunc && eventFunc instanceof Function) {
            if(this.currentHeightHandle){
                this.removeCurrentHeightHandle();
            }
            this.currentHeightHandle = eventFunc;
        }
    }

    /**
     * 触发当前水位变化的事件
     */
    triggerCurrentHeightHandle(){
        if(this.currentHeightHandle){
            this.currentHeightHandle(this.params.currentHeight);
        }
    }

    removeCurrentHeightHandle(){
        this.currentHeightHandle = null;
    }

    /**
     * 停止淹没分析模拟
     */
    stopFloodSimulate(){
        if(this.simulateParams.timeoutIndex){
            clearTimeout(this.simulateParams.timeoutIndex);
        }
        this.simulateParams.startStatus = false;
    }

    /**
     * 更新水体位置
     * @param updatePolygon 是否更新了水面多边形
     */
    _updateWaterObject(updatePolygon = false){
        let defalutHeight = this.params.defalutHeight;
        let realHeight = defalutHeight + this.params.currentHeight;
        let centerVector = this.centerVector;
        let firstPoint = null;
        if(this.polygon && this.polygon.threePositions && this.polygon.threePositions.length > 0){
            firstPoint = this.polygon.threePositions[0];
            centerVector = new THREE.Vector3(firstPoint[0], realHeight, firstPoint[1]);
            this.centerVector = centerVector;
        }else{    //没有多边形数据，不进行处理
            return;
        }

        if(!this.group){
            let group = new THREE.Group();
            this.world.add(group);
            this.group = group;
        }
        this.group.position.copy(centerVector);

        // 更新geometry
        if(updatePolygon){
            let pointList = [];

            for(let threePoint of this.polygon.threePositions){
                pointList.push([threePoint[0] - firstPoint[0], threePoint[1] - firstPoint[1]]);
            }

            if(!pointList || pointList.length < 2 || !centerVector){
                return;
            }

            //绘制geometry
            let shape = new THREE.Shape();
            shape.moveTo(pointList[0][0], -pointList[0][1]);//将初始点移动到第一个点位置
            for(let i = 1; i < pointList.length;i++) {
                shape.lineTo(pointList[i][0], -pointList[i][1]);//绘制线
            }
            shape.autoClose = true;//自动闭合
            let planeMeshGeometry = new THREE.ShapeBufferGeometry( shape );
            // planeMeshGeometry.rotateX( - Math.PI * 0.5);

            // 更新水面
            if(!this.waterPlane){
                let water = new Water( planeMeshGeometry, {
                    color: this.waterParams.color,
                    lightColor: this.waterParams.lightColor,
                    scale: 1,
                    flowDirection: new THREE.Vector2(1, 1),
                    textureWidth: 1024,
                    textureHeight: 1024,
                    encoding: THREE.RGBEEncoding,
                    normalMap0: new THREE.TextureLoader().load(waterNormalMap0),
                    normalMap1: new THREE.TextureLoader().load(waterNormalMap1),
                    clipBias: 0,
                } );
                //使用plane旋转
                water.rotation.x = - Math.PI * 0.5;
                this.group.add(water);
                this._assignUVs(water);
                this.waterPlane = water;
            }else{

            }

            //todo: 更新4个侧面
        }
        //todo: 更新定位或者侧面水体
    }

    _assignUVs(mesh) {
        let geometry = mesh.geometry;
        geometry.computeBoundingBox();
        let box = new THREE.Box3().setFromObject(mesh);
        let max = box.max,
            min = box.min;
        let offset = new THREE.Vector2(0 - min.x, 0 - min.z);
        let range = new THREE.Vector2(max.x - min.x, max.z - min.z);
        //处理纹理太长或者太宽的问题
        if(range.x / range.y > 2){
            range.x = range.x / Math.floor(range.x / range.y);
        }else if(range.y / range.x > 2){
            range.y = range.y / Math.floor(range.y / range.x);
        }
        let uvs = geometry.getAttribute('uv').array;
        let setUvs = [];
        for(let i = 0; i < uvs.length; i = i + 2){
            let uvX = uvs[i];
            let uvY = uvs[i+1];
            let offsetX = uvX + offset.x;
            let offsetY = uvY + offset.y;
            let uvX1 = offsetX / range.x;
            let uvY1 = offsetY / range.y;
            setUvs.push(uvX1);
            setUvs.push(uvY1);
        }
        geometry.attributes.uv = new THREE.BufferAttribute( new Float32Array(setUvs), 2);
        geometry.uvsNeedUpdate = true;
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

export default FloodAnalysis;

