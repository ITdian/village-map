/**
 * 可视域功能
 * @author lidy
 * @since 2022-02-16
 * 1、可以通过绘制观察点和目标点坐标来确定可视域范围
 * 2、也可以通过设置旋转参数， 可视域角度参数来调整可视域范围
 * 3、通过获取可视域范围内的所有threejs几何体， 复制并且使用同一的可视域材质
 * 4、计算片元着色器的像素坐标是否在可视域范围内，范围内的才进行渲染
 * 5、可视域材质通过新建的相机获取可视域范围内的深度纹理计算是否可视
 */

import * as THREE from 'three';
import { setModelScaleOption } from "../manage/ThreePositionManage"
import CoorTransformUtils from "../utils/CoorTransformUtils";
import threejsProperty from "../manage/threejsProperty";

import ResourceTracker from "../utils/resourceTracker";
// 定义resMgr和track用来清理three
let resMgr = new ResourceTracker();

class ViewShedAnalysis {
    constructor(map) {
        this.map = map;
        this.world = null;
        this.worldName = "ViewShedAnalysis-" + new Date().getTime();
        this.visualConeGroup = null;
        this.analysisGroup = null;

        this.coorTransformUtils = new CoorTransformUtils();

        this.maxDistance = 10000;

        this.params = {
            direction: 0,    //方向(度)
            pitch: 0,        //翻转(度)
            distance: 100,     //距离(米)
            horizontalFov: 90,  //水平视锥角(度)
            verticalFov: 60,    //垂直视锥角(度)
        };
        this.originVector = null;   //观察点坐标
        this.targetVector = null;   //目标点坐标
        this.lineMaterial = null;
        this.lineColor = 0x56fb2d;

        //鼠标事件方法
        this.mouseEventParams = {
            _onMouseClickFunc: null,
            _onMouseMoveFunc: null,
            _onMapboxClickFunc: null,
            _onMapboxMoveFunc: null,
            clickRaycasterIntersect: false,
            moveRaycasterIntersect: false,
            resolve: null,
            reject: null,
        }

        //视域范围4个点的位置
        this.viewShedDatas = {
            leftDownVector: null,
            rightDownVector: null,
            leftUpVector: null,
            rightUpVector: null,
        }

        this.analysisParams = {
            meshMapper: {},     //结构 {isExist: true, mapper: {}, object: null}
            meshMaterial: null,
            box: null,
            material: null,
            vertexShader: '',
            fragmentShader: '',
            visibleColor: new THREE.Color(0x00ff00),
            invisibleColor: new THREE.Color(0xff0000),
            alpha: 0.7,
        }

        //获取深度纹理的虚拟相机(获取深度纹理失败，放弃)
        this.virtualCameraParams = {
            camera: null,
            renderTarget: null,
            near: 0.1,
            far: 500,
            width: 4096,
            height: 4096,
        }

        // 用于渲染深度纹理的颜色值到renderer中
        this.depthRenderParams = {
            renderer: null,
            camera: null,
            scene: null,
            material: null,
            framebufferTexture: null,
        }

        //定时更新视域范围内的mesh
        this.timeoutParams = {
            timeoutIndex: null,
            timeoutInterval: 1000,
        }
    }

    init(){
        this.createWorldGroup();
        this._createShader();
        this._createMaterial();

        this.timeoutUpdateMesh();
    }

    /**
     * 销毁
     */
    dispose(){
        this.analysisParams = {
            meshMapper: {},
            meshMaterial: null,
        };
        this.removeTimeoutUpdateMesh();
        this._disposeMaterial();
        this.clear();
        this.removeWorldGroup();
    }

    setParams(params){
        if(params){
            for(let key in params){
                if(this.params.hasOwnProperty(key)){
                    this.params[key] = params[key];
                }
            }
            this.updateMaterialUniforms();
        }
    }

    clear(){
        this.originVector = null;
        this.targetVector = null;

        if(this.visualConeGroup){
            // 完全销毁visualConeGroup
            resMgr.track(this.visualConeGroup);
            resMgr.dispose();
            this.visualConeGroup = null;
        }
        if(this.analysisGroup){
            // 完全销毁analysisGroup
            resMgr.track(this.analysisGroup);
            resMgr.dispose();
            this.analysisGroup = null;
        }

        this._removeEvent();
    }

    timeoutUpdateMesh(){
        this.removeTimeoutUpdateMesh();
        this.timeoutParams.timeoutIndex = setTimeout(() => {
            this.manageAnalysisMesh();

            this.timeoutUpdateMesh();
        }, this.timeoutParams.timeoutInterval);
    }
    removeTimeoutUpdateMesh(){
        if(this.timeoutParams.timeoutIndex){
            clearTimeout(this.timeoutParams.timeoutIndex);
            this.timeoutParams.timeoutIndex = null;
        }
    }

    drawingViewShed(){
        // 添加点击事件， 获取观察点坐标， 目标点坐标， 计算出来（方向、翻转、距离）等信息
        // 绘制结束之后，返回params参数
        let _this = this;
        // 清除原来的事件以及展示的效果
        _this.clear();
        _this.mouseEventParams._onMouseClickFunc =  function(event){
            _this._onMouseClick(event, _this);
        }
        _this.mouseEventParams._onMouseMoveFunc =  function(event){
            _this._onMouseMove(event, _this);
        }
        _this.mouseEventParams._onMapboxClickFunc =  function(event){
            _this._onMapboxClick(event, _this);
        }
        _this.mouseEventParams._onMapboxMoveFunc =  function(event){
            _this._onMapboxMove(event, _this);
        }
        return new Promise((resolve, reject) => {
            _this.mouseEventParams.resolve = resolve;
            _this.mouseEventParams.reject = reject;

            _this._addEvent();
        });
    }

    _onMouseClick(event, _this){
        //获取threejs中的点
        let pointVector = _this._getThreeVectorByMouseEventevent(event);
        if(pointVector){
            _this.mouseEventParams.clickRaycasterIntersect = true;
            _this._createDrawVector(pointVector, 1);
        }else{
            _this.mouseEventParams.clickRaycasterIntersect = false;
        }
    }
    _onMouseMove(event, _this){
        if(this.originVector){
            //获取threejs中的点
            let pointVector = _this._getThreeVectorByMouseEventevent(event);
            if(pointVector){
                _this.mouseEventParams.moveRaycasterIntersect = true;
                _this._createDrawVector(pointVector, 0);
            }else{
                _this.mouseEventParams.moveRaycasterIntersect = false;
            }
        }
    }
    _getThreeVectorByMouseEventevent(){
        let raycaster = new THREE.Raycaster();
        let mouse = new THREE.Vector2();
        mouse.x = (event.offsetX / threejsProperty.renderer.domElement.clientWidth) * 2 - 1;
        mouse.y = -(event.offsetY / threejsProperty.renderer.domElement.clientHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, threejsProperty.camera);
        let intersectWorlds = threejsProperty.worlds.filter(item => {
            if(item.name){
                return !item.name.includes("ViewShedAnalysis");
            }
            return false;
        })
        let intersects = raycaster.intersectObjects(intersectWorlds, true);
        if (intersects && intersects.length > 0) {
            let intersect = intersects[0];
            let pointVector = intersect.point;
            return pointVector;
        }else{
            return null;
        }

    }

    _onMapboxClick(event, _this){
        if(!_this.mouseEventParams.clickRaycasterIntersect){
            let pointVector = _this.mapboxClickToThreeCoor(event);
            // 处理绘制事件
            _this._createDrawVector(pointVector, 1);
        }
    }

    _onMapboxMove(event, _this){
        if(this.originVector && !_this.mouseEventParams.moveRaycasterIntersect){
            let pointVector = _this.mapboxClickToThreeCoor(event);
            // 处理绘制事件
            _this._createDrawVector(pointVector, 0);
        }
    }

    /**
     * 创建绘制的观察点、目标点
     * @param mouseType 0: move, 1: click
     */
    _createDrawVector(pointVector3, mouseType){
        let mercatorVector = this.coorTransformUtils.threeWorldToLocal(pointVector3);
        if(mouseType == 0){
            if(this.originVector){
                this.targetVector = mercatorVector;
                //生成配置参数
                this.targetVectorToParams();
                //生成视锥范围
                this.createVisualRange();
                //更新材质参数
                this.updateMaterialUniforms();
            }
        }else{
            console.log(mercatorVector);
            if(!this.originVector){
                this.originVector = mercatorVector;
                //更新材质参数
                this.updateMaterialUniforms();
            }else{
                //完成绘制
                this.targetVector = mercatorVector;
                //生成配置参数
                this.targetVectorToParams();
                //生成视锥范围()
                this.createVisualRange();
                //移除点击事件
                this._removeEvent();
                // 异步返回配置参数
                if(this.mouseEventParams.resolve){
                    this.mouseEventParams.resolve(this.params);
                    this.mouseEventParams.resolve = null;
                    this.mouseEventParams.reject = null;
                }

            }
        }
    }

    mapboxClickToThreeCoor(e){
        let lngLat = e.lngLat;
        let elevation = this.map.queryTerrainElevation(lngLat, { exaggerated: false });
        elevation = elevation ? elevation : 0;
        let worldVector = this.coorTransformUtils.wgs84ToThreeWorld(lngLat.lng, lngLat.lat, elevation);
        return worldVector;
    }

    _addEvent(){
        this.map.on('click', this.mouseEventParams._onMapboxClickFunc);
        this.map.on('mousemove', this.mouseEventParams._onMapboxMoveFunc);
    }

    _removeEvent() {
        threejsProperty.renderer.domElement.removeEventListener('click', this.mouseEventParams._onMouseClickFunc, false);
        threejsProperty.renderer.domElement.removeEventListener('mousemove', this.mouseEventParams._onMouseMoveFunc, false);
        this.map.off('click', this.mouseEventParams._onMapboxClickFunc);
        this.map.off('mousemove', this.mouseEventParams._onMapboxMoveFunc);
    }


    /**
     * 通过观察点坐标和目标点坐标生成配置中的方向(direction)、翻转(pitch)、距离(distance)
     */
    targetVectorToParams(){
        let targetVector = this.targetVector;
        let originVector = this.originVector;

        //计算距离
        let distance = originVector.distanceTo(targetVector);
        if(distance > this.maxDistance){
            distance = this.maxDistance;
        }
        this.params.distance = distance;

        let viewVector = new THREE.Vector3().subVectors(targetVector, originVector);
        //计算pitch翻转(度)
        let yUpVector = new THREE.Vector3(0, 1, 0);
        let yRadians = viewVector.angleTo(yUpVector);
        let pitch = 90 - yRadians * 180 / Math.PI;
        this.params.pitch = pitch;
        //计算direction方向(度)
        viewVector.y = 0;
        if(Math.abs(pitch) == 90){
            this.params.direction = 0;
        }else{
            //正北方向为Z的负轴方向
            let zDownVector = new THREE.Vector3(0, 0, -1);
            let zRadians = viewVector.angleTo(zDownVector);
            let direction = zRadians * 180 / Math.PI;
            let crossVector = new THREE.Vector3().crossVectors(viewVector, zDownVector);
            if(crossVector.y < 0) {
                //角度是逆时针方向的
                direction = 360 - direction;
            }
            this.params.direction = direction;
        }

    }

    /**
     * 通过配置获取偏移向量
     * @return {Vector3}
     */
    createTransformVectorByParams(params){
        let matrix = this.createRotationMatrix(params);
        let transformVector = new THREE.Vector3(0, 0, -params.distance);
        transformVector.applyMatrix4(matrix);
        return transformVector;
    }

    createRotationMatrix(params){
        let matrixRotateX = new THREE.Matrix4().makeRotationX(Math.PI * params.pitch / 180);

        let rotateVectorY = new THREE.Vector3(0, 1, 0);
        rotateVectorY.applyMatrix4(matrixRotateX.clone().invert());
        let matrixRotateY = new THREE.Matrix4().makeRotationAxis(rotateVectorY, -Math.PI * params.direction / 180);

        let matrix = new THREE.Matrix4().multiplyMatrices(matrixRotateX, matrixRotateY);

        return matrix;
    }

    /**
     * 生成视锥范围
     */
    createVisualRange(){
        // 通过originVector和params参数生成视锥范围的线
        let lineGeometry = this.createViewShedLineGeometry();

        let group = this.visualConeGroup;
        //创建用于保存多边形的group
        if(!group){
            group = new THREE.Group();
            group.userData.id = "visualConeGroup-" + new Date().getTime();
            group.position.copy(this.originVector);
            setModelScaleOption(group);
            this.world.add(group);
            this.visualConeGroup = group;
        }

        //遍历linePathList,生成每一条line
        for(let index in lineGeometry){
            let geometry = lineGeometry[index];
            let line = null;
            if (group.children && group.children[index]) {
                line = group.children[index];
            }
            if (!line) {
                let color = this.lineColor;
                if (!this.lineMaterial) {
                    const material = new THREE.LineBasicMaterial({
                        color: color
                    });
                    this.lineMaterial = material;
                }
                line = new THREE.Line(geometry, this.lineMaterial);
                group.add(line);
            } else {
                line.geometry = geometry;
            }
        }

        // 刷新范围内的面
        this.manageAnalysisMesh();
        // 生成相机以及角度
        this.manageVirtualCamera();
        // 生成深度纹理
        this.manageDepthRenderScene();
    }

    createLineGeometryByLinePath(linePath){
        var geometry = new THREE.BufferGeometry();
        geometry.setFromPoints(linePath);
        return geometry;
    }

    createViewShedLineGeometry(){

        let lineGeometrys = [];
        // 计算圆弧线
        let linePathList = [];

        //对照threejs的视锥体绘制弧形的视锥体
        let targetVector = new THREE.Vector3(0, 0, -this.params.distance);
        let height = Math.tan(Math.PI * (this.params.verticalFov / 2) / 180) * this.params.distance * 2;
        let width = height * this.params.horizontalFov / this.params.verticalFov;

        this.viewShedDatas.leftDownVector = new THREE.Vector3(-width/2, -height/2, targetVector.z);
        this.viewShedDatas.rightDownVector = new THREE.Vector3(width/2, -height/2, targetVector.z);
        this.viewShedDatas.leftUpVector = new THREE.Vector3(-width/2, height/2, targetVector.z);
        this.viewShedDatas.rightUpVector = new THREE.Vector3(width/2, height/2, targetVector.z);

        //计算4条边
        for(let key in this.viewShedDatas){
            let viewShedVectorItem = this.viewShedDatas[key].clone();
            viewShedVectorItem.normalize().multiplyScalar(this.params.distance);
            linePathList.push([new THREE.Vector3(), viewShedVectorItem]);
        }
        //计算水平弧线
        let intervalNum = 10;
        let verticalChangeVector = new THREE.Vector3(0, height / intervalNum, 0);
        for(let i = 0; i <= intervalNum; i++){
            let currentChangeVector = verticalChangeVector.clone().multiplyScalar(i);
            let leftDownVector = new THREE.Vector3().addVectors(this.viewShedDatas.leftDownVector, currentChangeVector);
            let rightDownVector = new THREE.Vector3().addVectors(this.viewShedDatas.rightDownVector, currentChangeVector);
            linePathList.push(this.createArcLine(leftDownVector, rightDownVector));
        }
        //计算垂直弧线
        let horizontaChangeVector = new THREE.Vector3(width / intervalNum, 0, 0);
        for(let i = 0; i <= intervalNum; i++){
            let currentChangeVector = horizontaChangeVector.clone().multiplyScalar(i);
            let leftDownVector = new THREE.Vector3().addVectors(this.viewShedDatas.leftDownVector, currentChangeVector);
            let leftUpVector = new THREE.Vector3().addVectors(this.viewShedDatas.leftUpVector, currentChangeVector);
            linePathList.push(this.createArcLine(leftDownVector, leftUpVector));
        }

        //添加视锥体平面的线
        /*linePathList.push([
            this.viewShedDatas.leftDownVector,
            this.viewShedDatas.rightDownVector,
            this.viewShedDatas.rightUpVector,
            this.viewShedDatas.leftUpVector,
            this.viewShedDatas.leftDownVector,
        ]);*/

        //创建geometry, 并且旋转
        let matrix = this.createRotationMatrix(this.params);
        for(let linePathItem of linePathList){
            let geometry = this.createLineGeometryByLinePath(linePathItem);
            geometry.applyMatrix4(matrix);
            lineGeometrys.push(geometry);
        }

        //计算中心点的连线
        // let targetVector = this.createTransformVectorByParams(this.params);
        // lineGeometrys.push(this.createLineGeometryByLinePath([new THREE.Vector3(), targetVector]));

        return lineGeometrys;
    }

    /**
     *
     * @param vector1 点1
     * @param vector2 点2
     * @param pointNum 点的数目
     */
    createArcLine(vector1, vector2, pointNum = 36){

        let vectorChange = new THREE.Vector3().subVectors(vector2, vector1);
        vectorChange.multiplyScalar(1 / pointNum);

        let points = [];

        for(let i = 0; i <= pointNum; i++){
            let currentChangeVector = vectorChange.clone().multiplyScalar(i);
            let pointVector = new THREE.Vector3().addVectors(vector1, currentChangeVector);
            pointVector.normalize().multiplyScalar(this.params.distance);
            points.push(pointVector);
        }

        return points;

    }

    /**
     * 管理可视域分析功能所有的mesh内容
     * 一般在定时器中触发(频率为2s)，用于判断3dtiles模型是否存在变化
     * 或者在参数变化之后触发
     */
    manageAnalysisMesh(){
        let _this = this;
        // 遍历所有的没有遍历过的非3dtiles分组
        // 遍历所有的3dtiles分组

        this.resetMeshMapperState();
        if(this.visualConeGroup && threejsProperty && threejsProperty.worlds && threejsProperty.worlds.length > 0){
            this.analysisParams.box = new THREE.Box3().expandByObject(this.visualConeGroup);
            let intersectWorlds = threejsProperty.worlds.filter(item => {
                if(item.name){
                    return !item.name.includes("ViewShedAnalysis");
                }
                return false;
            })
            for(let worldTemp of intersectWorlds){
                let uuid = worldTemp.uuid;
                if(this.analysisParams.meshMapper[uuid]){
                    this.analysisParams.meshMapper[uuid].isExist = true;
                }else{
                    this.analysisParams.meshMapper[uuid] = {
                        isExist: true,
                        mapper: {},
                        object: null,
                    }
                }
                // 递归遍历孩子节点
                recursionChildren(worldTemp, uuid);
            }
            // 遍历处理mapper数据
            // 判断在包围盒里面的mesh，已经添加的就添加标记，没有添加的就添加mesh。
            for(let mapperKey in this.analysisParams.meshMapper){
                let mapperItem = this.analysisParams.meshMapper[mapperKey];
                // 处理下一级mapper
                for(let itemKey in mapperItem.mapper){
                    let item = mapperItem.mapper[itemKey];
                    if(item.object){
                        if(item.isExist){
                            this.manageAnalysisGroup(item.object);
                        }else{
                            this.removeAnalysisGroupChildren(item.object);
                            delete mapperItem.mapper[itemKey];
                        }
                    }
                }
            }
        }


        /**
         * 递归遍历所有的孩子节点
         * @param _object
         * @param _uuid
         */
        function recursionChildren(_object, _uuid){
            if(_object){
                // 判断是否在包围盒内
                let itemBox = new THREE.Box3().expandByObject(_object);
                if(_this.analysisParams.box.intersectsBox(itemBox)){
                    if(_object instanceof THREE.Mesh && _object.visible){
                        let itemUuid = _object.uuid;
                        // 判断已经存在的， 修改isExist值
                        if(_this.analysisParams.meshMapper[_uuid].mapper[itemUuid]){
                            _this.analysisParams.meshMapper[_uuid].mapper[itemUuid].isExist = true;
                        }else{
                            // 没有存在的，添加item
                            let meshMapperItem = {
                                isExist: true,
                                mapper: {},
                                object: _object.clone(),
                            }
                            _this.analysisParams.meshMapper[_uuid].mapper[itemUuid] = meshMapperItem;
                        }
                    }
                    if(_object.children && _object.children.length > 0){
                        for(let children of _object.children){
                            recursionChildren(children, _uuid);
                        }
                    }
                }
            }
        }
    }

    manageAnalysisGroup(meshObject){
        let worldMatrix = threejsProperty.mercatorWorld.matrix;
        let worldMatrixInvert = new THREE.Matrix4().copy(worldMatrix).invert();
        if(!this.analysisGroup){
            this.analysisGroup = new THREE.Group();
            this.analysisGroup.applyMatrix4(worldMatrixInvert);
            this.world.add(this.analysisGroup);
        }
        let groupMatrixInvert = new THREE.Matrix4().copy(this.analysisGroup.matrixWorld).invert();

        //不存在parent则添加
        if(!meshObject.parent){
            //处理坐标转换
            let matrix4 = groupMatrixInvert.clone().multiply(meshObject.matrixWorld);
            meshObject.position.set(0,0,0);
            meshObject.scale.set(1,1,1);
            meshObject.rotation.set(0,0,0);
            meshObject.quaternion.set(0,0,0,1);
            meshObject.updateMatrix();
            meshObject.applyMatrix4(matrix4);

            meshObject.material = this.analysisParams.material;
            this.analysisGroup.add(meshObject);
        }
    }

    removeAnalysisGroupChildren(childrenObject){
        // 完全销毁
        if(childrenObject){
            resMgr.track(childrenObject);
            resMgr.dispose();
        }
    }

    /**
     * 重置meshMapper状态
     */
    resetMeshMapperState(){
        if(this.analysisParams && this.analysisParams.meshMapper){
            for(let mapperKey in this.analysisParams.meshMapper){
                let mapperItem = this.analysisParams.meshMapper[mapperKey];
                mapperItem.isExist = false;
                if(mapperItem.mapper){
                    for(let itemKey in mapperItem.mapper){
                        mapperItem.mapper[itemKey].isExist = false;
                    }
                }
            }
        }
    }

    /**
     * 创建shader
     */
    _createShader(){
        this.analysisParams.vertexShader = `
            varying vec4 worldPosition;
        
            void main() {
                
                vec4 modelPosition =  modelMatrix * vec4( position, 1.0 );
                worldPosition = modelPosition;
                
                vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
                gl_Position = projectionMatrix * mvPosition;
                
            }
        `;

        /***
         * @function twoVectorAngle计算2个三维向量的夹角
         * @function getViewShedRange获取当前点的平面范围
         * @function checkViewShed通过夹角计算当前向量的垂直距离， 通过垂直距离得出视锥体的范围(宽高)
         * @function getVirtualUv计算获取当前点的uv坐标()
         * @function checkVisible深度转换为distance距离，判断距离是否可见
         * @type {string}
         */
        this.analysisParams.fragmentShader = `
            #include <packing>
                    
            precision lowp float;
        
            uniform vec3 visibleColor;
            uniform vec3 invisibleColor;
            uniform float alphaParam;
            uniform vec3 originVector;
            
            uniform float cameraNear;
            
            uniform float directionParam;
            uniform float pitchParam;
            uniform float distanceParam;
            uniform float horizontalFovParam;
            uniform float verticalFovParam;
            
            uniform mat4 angleMatrix;
            
            uniform sampler2D customDataTexure;
            
            varying vec4 worldPosition;
            
            float twoVectorAngle(vec3 vector1, vec3 vector2) {
                float cos1 = (vector1.x * vector2.x + vector1.y * vector2.y + vector1.z * vector2.z) / ( sqrt( pow(vector1.x,2.0) + pow(vector1.y,2.0) + pow(vector1.z,2.0) ) * sqrt( pow(vector2.x,2.0) + pow(vector2.y,2.0) + pow(vector2.z,2.0) ) );
                return degrees(acos(cos1));
            }
            
            vec2 getViewShedRange(vec3 viewVector){
                    float verticalDis = abs(viewVector.z);
                    float planeHeight = tan(radians(verticalFovParam / 2.0)) * verticalDis * 2.0;
                    float planeWidth = planeHeight * horizontalFovParam / verticalFovParam;
                    return vec2(planeWidth, planeHeight);
            }
            
            bool checkViewShed(vec3 viewVector, vec2 viewRange){
                if(viewVector.z < 0.0){
                    float planeHalfWidth = viewRange.x * 0.5;
                    float planeHalfHeight = viewRange.y * 0.5;
                    
                    if(viewVector.x > -planeHalfWidth && viewVector.x < planeHalfWidth && viewVector.y > -planeHalfHeight && viewVector.y < planeHalfHeight){
                        return true;
                    }
                }
                
                return false;
            }
            
            vec2 getVirtualUv(vec3 viewVector, vec2 viewRange){
                vec2 originUv = vec2(-viewRange.x/2.0, -viewRange.y/2.0);
                vec2 virtualRange = vec2(viewVector.x - originUv.x, viewVector.y - originUv.y);
                vec2 virtualUv = vec2(virtualRange.x / viewRange.x, virtualRange.y / viewRange.y);
                return virtualUv;
            }
            
            bool checkVisible(vec3 viewVector, vec2 viewRange, float dis1){
                vec2 vUv = getVirtualUv(viewVector, viewRange);
                vec4 depthColor = texture2D( customDataTexure, vUv );
                vec4 depthData = depthColor * 255.;
                float depth = depthData.r * 256.0 + depthData.g + depthData.b * 0.01;
                float pDepth = viewZToPerspectiveDepth(-depth, cameraNear, distanceParam);
                float disScale = dis1 / abs(viewVector.z);
                float realDepth = -perspectiveDepthToViewZ(pDepth, cameraNear * disScale, distanceParam * disScale);
                
                if(dis1 <= realDepth + 0.1){
                    return true;
                }
                return false;
            }
            
            void main() {
                bool show = false;
                vec3 finalColor = invisibleColor;
                vec3 fsPosition = vec3(worldPosition.x, worldPosition.y, worldPosition.z);
                float dis1 = distance(originVector, fsPosition);
                
                if(dis1 <= distanceParam){
                    vec3 dirVector = fsPosition - originVector;
                    vec4 rotateVector =  angleMatrix * vec4( dirVector, 1.0 );
                    vec3 viewVector = vec3(rotateVector.x, rotateVector.y, rotateVector.z);
                    
                    vec2 viewRange = getViewShedRange(viewVector);
                    
                    bool checkRange = checkViewShed(viewVector, viewRange);
                    if(checkRange){
                        show = true;
                        if(checkVisible(viewVector, viewRange, dis1)){
                            finalColor = visibleColor;
                        }
                    }
                }
                
                if(show){
                    gl_FragColor = vec4( finalColor, alphaParam );
                }
            }
        `;

        // 计算角度范围、 距离， 确认在视域范围内的进行展示
        // 获取视域范围内的相机深度纹理
    }
    _createMaterial(){
        if(!this.analysisParams.material){
            // this.material = new THREE.MeshBasicMaterial( {color: this.color, transparent: true, opacity: this.colorAlpha} );
            this.analysisParams.material = new THREE.ShaderMaterial( {
                uniforms: {
                    visibleColor: { value: this.analysisParams.visibleColor },
                    invisibleColor: { value: this.analysisParams.invisibleColor },
                    alphaParam: { value: this.analysisParams.alpha },
                    originVector: { value: new THREE.Vector3() },
                    //虚拟相机near
                    cameraNear: {value: this.virtualCameraParams.near},
                    //配置参数
                    directionParam: { value: this.params.direction },
                    pitchParam: { value: this.params.pitch },
                    distanceParam: { value: this.params.distance },
                    horizontalFovParam: { value: this.params.horizontalFov },
                    verticalFovParam: { value: this.params.verticalFov },
                    //旋转矩阵
                    angleMatrix: { value: new THREE.Matrix4() },
                    //纹理
                    customDataTexure: { value: null },
                },
                uniformsNeedUpdate: true,    //强制更新
                vertexShader: this.analysisParams.vertexShader,
                fragmentShader: this.analysisParams.fragmentShader,
                // blending: THREE.AdditiveBlending,
                depthTest: true,      //true: 被遮挡的不显示
                transparent: true,
                opacity: 1.0
            } );
        }
    }
    updateMaterialUniforms(){
        let params = this.params;
        let originVectorWorld = this.coorTransformUtils.threeLocalToWorld(this.originVector);
        this.analysisParams.material.uniforms.originVector.value =  originVectorWorld;
        //设置参数
        this.analysisParams.material.uniforms.directionParam.value =  params.direction;
        this.analysisParams.material.uniforms.pitchParam.value =  params.pitch;
        this.analysisParams.material.uniforms.distanceParam.value =  params.distance;
        this.analysisParams.material.uniforms.horizontalFovParam.value =  params.horizontalFov;
        this.analysisParams.material.uniforms.verticalFovParam.value =  params.verticalFov;
        //旋转矩阵
        let matrix = this.createRotationMatrix(params);
        this.analysisParams.material.uniforms.angleMatrix.value = matrix.invert();
    }
    _disposeMaterial(){
        if(this.material){
            this.material.dispose();
        }
        this.material = null;
    }

    /**
     * 管理虚拟相机
     */
    manageVirtualCamera(){
        let params = this.params;
        let virtualCameraParams = this.virtualCameraParams;
        let originVectorWorld = this.coorTransformUtils.threeLocalToWorld(this.originVector);

        let targetVector = this.createTransformVectorByParams(params);
        //计算视域角度
        let viewMatrix = new THREE.Matrix4().lookAt(new THREE.Vector3(), targetVector, new THREE.Vector3(0,1,0));
        // let euler = new THREE.Euler().setFromRotationMatrix(viewMatrix);
        // 相机设置
        let cameraMatrix = new THREE.Matrix4().setPosition(originVectorWorld.x, originVectorWorld.y, originVectorWorld.z);
        cameraMatrix.multiply(viewMatrix);

        let camera;
        let cameraFov = params.verticalFov;
        let cameraAspect = params.horizontalFov/params.verticalFov;
        let cameraNear = virtualCameraParams.near;
        virtualCameraParams.far = params.distance;
        let camerafar = virtualCameraParams.far;
        if(virtualCameraParams.camera){
            camera = virtualCameraParams.camera;
            camera.fov = cameraFov;
            camera.aspect = cameraAspect;
            camera.far = camerafar;
        }else{
            camera = new THREE.PerspectiveCamera(cameraFov, cameraAspect, cameraNear, camerafar);
            camera.matrixAutoUpdate = false;
            virtualCameraParams.camera = camera;
        }
        camera.position.copy(originVectorWorld);
        camera.matrix.copy(cameraMatrix);
        camera.matrixWorld.copy(cameraMatrix);
        camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
        camera.updateProjectionMatrix();

        let frustum = new THREE.Frustum();
        frustum.setFromProjectionMatrix(
            new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
        );

        //处理renderTarget
        let renderTarget;
        if(!virtualCameraParams.renderTarget){
            let depthTexture = new THREE.DepthTexture();
            depthTexture.type = THREE.UnsignedInt248Type;
            depthTexture.format = THREE.DepthStencilFormat;
            depthTexture.minFilter = THREE.NearestFilter;
            depthTexture.magFilter = THREE.NearestFilter;
            const parameters = {
                minFilter: THREE.NearestFilter,
                magFilter: THREE.NearestFilter,
                format: THREE.RGBAFormat,
                encoding: THREE.sRGBEncoding,
                depthTexture: depthTexture,
            };
            renderTarget = new THREE.WebGLRenderTarget( virtualCameraParams.width, virtualCameraParams.height, parameters );
            virtualCameraParams.renderTarget = renderTarget;
        }
    }

    manageDepthRenderScene(){
        let depthRenderParams = this.depthRenderParams;
        let virtualCameraParams = this.virtualCameraParams;
        if(!depthRenderParams.renderer){
            depthRenderParams.renderer = new THREE.WebGLRenderer();
            depthRenderParams.renderer.setPixelRatio( window.devicePixelRatio );
            depthRenderParams.renderer.setSize( virtualCameraParams.width, virtualCameraParams.height );
        }
        if(!depthRenderParams.camera){
            depthRenderParams.camera = new THREE.OrthographicCamera( - 1, 1, 1, - 1, 0, 1 );
        }
        if(!depthRenderParams.material){
            let vertexShader = `
                    varying vec2 vUv;

                    void main() {
                        vUv = uv;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `;
            let fragmentShader = `
                    #include <packing>

                    varying vec2 vUv;
                    uniform sampler2D tDepth;
                    uniform float cameraNear;
                    uniform float cameraFar;
        
                    float readDepth( sampler2D depthSampler, vec2 coord ) {
                        float fragCoordZ = texture2D( depthSampler, coord ).x;
                        float viewZ = perspectiveDepthToViewZ( fragCoordZ, cameraNear, cameraFar );
                        return -viewZ;
                    }
        
                    vec3 createDepthColor(float depth){
                        float depthInt = floor(depth);
                        float r = floor(depthInt / 256.0);
                        float g = depthInt - r * 256.0;
                        
                        float depthDecimal = fract(depth);
                        depthDecimal = depthDecimal * 100.0;
                        depthDecimal = floor(depthDecimal);
                        float b = depthDecimal;
                        
                        return vec3(r / 255.0, g / 255.0, b / 255.0);
                    }
        
                    void main() {
                        float depth = readDepth( tDepth, vUv );
                        vec3 depthColor = createDepthColor(depth);
                        gl_FragColor = vec4(depthColor, 1.0);
                    }
                `;
            depthRenderParams.material = new THREE.ShaderMaterial( {
                vertexShader: vertexShader,
                fragmentShader: fragmentShader,
                uniforms: {
                    cameraNear: { value: virtualCameraParams.near },
                    cameraFar: { value: virtualCameraParams.far },
                    tDepth: { value: virtualCameraParams.renderTarget.depthTexture }
                }
            } );
        }else{
            depthRenderParams.material.uniforms.cameraFar.value = virtualCameraParams.far;
        }

        if(!depthRenderParams.scene){
            const postPlane = new THREE.PlaneGeometry( 2, 2 );
            const postQuad = new THREE.Mesh( postPlane, depthRenderParams.material );
            depthRenderParams.scene = new THREE.Scene();
            depthRenderParams.scene.add( postQuad );
        }

        if(this.analysisGroup){
            depthRenderParams.renderer.setRenderTarget( virtualCameraParams.renderTarget );
            depthRenderParams.renderer.render( this.analysisGroup, virtualCameraParams.camera );
            depthRenderParams.renderer.setRenderTarget(null);
            depthRenderParams.renderer.render( depthRenderParams.scene, depthRenderParams.camera );
        }

        if(!depthRenderParams.framebufferTexture){
            depthRenderParams.framebufferTexture = new THREE.CanvasTexture(depthRenderParams.renderer.domElement);
            depthRenderParams.framebufferTexture.magFilter = THREE.NearestFilter;
            depthRenderParams.framebufferTexture.minFilter = THREE.LinearFilter;
            //更新纹理
            this.analysisParams.material.uniforms.customDataTexure.value = depthRenderParams.framebufferTexture;
        }
        //更新纹理
        depthRenderParams.framebufferTexture.needsUpdate = true;
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

export default ViewShedAnalysis;
