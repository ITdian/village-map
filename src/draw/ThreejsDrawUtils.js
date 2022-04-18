import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial';

import {Water} from '../effect/ThreejsWater';

import waterBackgroupImage from '../assets/texture/waterBackgroup.jpg';
import waterNormalMap0 from '../assets/texture/Water_1_M_Normal.jpg';
import waterNormalMap1 from '../assets/texture/Water_2_M_Normal.jpg';
import { setModelScaleOption, setModelUseTerrainHeightOption } from "../manage/ThreePositionManage";
import highlightAlphaMap from '../assets/texture/alpha.jpg';
import threejsProperty from "../manage/threejsProperty";
import CoorTransformUtils from "../utils/CoorTransformUtils";
const coorTransformUtils = new CoorTransformUtils();

var _this;
class ThreejsDrawUtils {
    constructor(map) {
        _this = this;
        this.map = map;
        this.worldName = "drawWorld-" + new Date().getTime();
        this.world = null;
        this.polygonParams = {
            polygonId: null,
            material: null,
            offsetX: 0,
            offsetY: 0,
            clickTime: 0,
            pointList: [],      //Vector3类型列表(墨卡托坐标)
            centerVector: null,    //中心点
            pointNum: 0,
            group: null,
            line: null,
            plane: null,
            resolve: null,
            reject: null,
            moveRaycasterIntersect: false,
            clickRaycasterIntersect: false,
            dblclickRaycasterIntersect: false,
        }
        this.lineParams = {
            lineId: null,
            material: null,
            offsetX: 0,
            offsetY: 0,
            clickTime: 0,
            pointList: [],      //Vector3类型列表(墨卡托坐标)
            centerVector: null,    //中心点
            pointNum: 0,
            group: null,
            line: null,
            resolve: null,
            reject: null,
            moveRaycasterIntersect: false,
            clickRaycasterIntersect: false,
        }
        this.waterObj = {
            waterList: [],
            waterAnimation: false
        }
        this.boxParams = {
            raycasterIntersect: false,
            object: null
        }
        this.highlightGroup = null

        this.init();
    }

    //初始化
    init(){
        _this.createWorldGroup();
    }
    //销毁
    destroy(){
        _this.removeWorldGroup();
        _this.endDrawPolygon();
        _this.endDrawLine();
        _this.removeAllWaterPolygon();
        _this.world = null;
        threejsProperty.cameraSync.updateCamera();
    }

    //在地板绘制多边形
    drawPolygon(id){
        _this.polygonParams.polygonId = id;
        //设置不能双击缩放
        _this.map.doubleClickZoom.disable()
        //初始化
        _this.polygonParams.pointList = [];
        _this.polygonParams.group = null;
        _this.polygonParams.line = null;
        _this.polygonParams.plane = null;
        //鼠标点击事件
        return new Promise((resolve, reject) => {
            _this.polygonParams.resolve = resolve;
            _this.polygonParams.reject = reject;
            threejsProperty.renderer.domElement.addEventListener('click', _this._onPolygonClick, false)
            threejsProperty.renderer.domElement.addEventListener('dblclick', _this._onPolygonDblclick, false)
            threejsProperty.renderer.domElement.addEventListener('mousemove', _this._onPolygonMove, false)
            _this.map.on('mousemove', _this.onMapPolygonMove);
            _this.map.on('click', _this.onMapPolygonClick);
            _this.map.on('dblclick', _this.onMapPolygonDblClick);
        });
    }
    endDrawPolygon(){
        //恢复双击缩放
        setTimeout(function () {
            _this.map.doubleClickZoom.enable();
        }, 1000);
        if(_this.polygonParams.reject){
            _this.polygonParams.reject("取消绘制");
            _this.polygonParams.resolve = null;
            _this.polygonParams.reject = null;
        }
        //移除鼠标点击事件
        threejsProperty.renderer.domElement.removeEventListener('mousemove', _this._onPolygonMove, false)
        threejsProperty.renderer.domElement.removeEventListener('click', _this._onPolygonClick, false)
        threejsProperty.renderer.domElement.removeEventListener('dblclick', _this._onPolygonDblclick, false)
        _this.map.off('mousemove', _this.onMapPolygonMove);
        _this.map.off('click', _this.onMapPolygonClick);
        _this.map.off('dblclick', _this.onMapPolygonDblClick);
    }
    _onPolygonMove(event){
        if(_this.polygonParams.centerVector && _this.polygonParams.pointList.length > 0) {
            //获取threejs中的点
            let raycaster = new THREE.Raycaster();
            let mouse = new THREE.Vector2();
            mouse.x = (event.offsetX / threejsProperty.renderer.domElement.clientWidth) * 2 - 1;
            mouse.y = -(event.offsetY / threejsProperty.renderer.domElement.clientHeight) * 2 + 1;
            raycaster.setFromCamera(mouse, threejsProperty.camera);
            let intersects = raycaster.intersectObjects(threejsProperty.scene.children, true);
            if (intersects && intersects.length > 0) {
                _this.polygonParams.moveRaycasterIntersect = true;

                let intersect = intersects[0];
                let pointVector = intersect.point;
                _this._createPolygon(pointVector, 0);
            }else{
                _this.polygonParams.moveRaycasterIntersect = false;
            }
        }
    }
    _onPolygonClick(event){
        let errorValue = 5;
        let nowTime = Date.now();
        if(nowTime - _this.polygonParams.clickTime < 500
            && event.offsetX > _this.polygonParams.offsetX - errorValue && event.offsetX < _this.polygonParams.offsetX + errorValue
            && event.offsetY > _this.polygonParams.offsetY - errorValue && event.offsetY < _this.polygonParams.offsetY + errorValue){
            //双击事件
            return;
        }
        _this.polygonParams.clickTime = nowTime;
        _this.polygonParams.offsetX = event.offsetX;
        _this.polygonParams.offsetY = event.offsetY;
        //获取threejs中的点
        let raycaster = new THREE.Raycaster();
        let mouse = new THREE.Vector2();
        mouse.x = ( event.offsetX / threejsProperty.renderer.domElement.clientWidth ) * 2 - 1;
        mouse.y = - ( event.offsetY / threejsProperty.renderer.domElement.clientHeight ) * 2 + 1;
        raycaster.setFromCamera(mouse, threejsProperty.camera);
        let intersects = raycaster.intersectObjects(threejsProperty.scene.children, true);
        if(intersects && intersects.length > 0){
            _this.polygonParams.clickRaycasterIntersect = true;

            let intersect = intersects[0];
            let pointVector = intersect.point;
            _this._createPolygon(pointVector, 1);
        }else{
            _this.polygonParams.clickRaycasterIntersect = false;
        }
    }
    _onPolygonDblclick(event){
        _this.polygonParams.clickRaycasterIntersect = true;
        _this._createPolygon(null, 2);
    }
    onMapPolygonMove(e){
        if(!_this.polygonParams.moveRaycasterIntersect && _this.polygonParams.centerVector && _this.polygonParams.pointList.length > 0){
            let pointVector3 = _this.mapboxClickToThreeCoor(e);
            // 处理绘制事件
            _this._createPolygon(pointVector3, 0);
        }
    }
    onMapPolygonClick(e){
        if(!_this.polygonParams.clickRaycasterIntersect){
            let pointVector3 = _this.mapboxClickToThreeCoor(e);
            // 处理绘制事件
            _this._createPolygon(pointVector3, 1);
        }
    }
    onMapPolygonDblClick(e){
        if(!_this.polygonParams.dblclickRaycasterIntersect){
            let pointVector3 = _this.mapboxClickToThreeCoor(e);
            // 处理绘制事件
            _this._createPolygon(pointVector3, 2);
        }
    }

    /**
     * 创建多边形
     * @param pointVector3
     * @param mouseType 0: move, 1: click, 2: dblclick
     * @private
     */
    _createPolygon(pointVector3, mouseType){
        let mercatorVector = coorTransformUtils.threeWorldToLocal(pointVector3);
        if(mouseType == 0){
            //不设置高度
            // mercatorVector.y = 0;
            //设置鼠标移动点的位置
            if(_this.polygonParams.pointNum < _this.polygonParams.pointList.length){
                _this.polygonParams.pointList.pop();
            }
            let mercatorPoint = new THREE.Vector3().subVectors(mercatorVector, _this.polygonParams.centerVector);
            _this.polygonParams.pointList.push(mercatorPoint);
            createPolygon1(_this.polygonParams.pointList, _this.polygonParams.centerVector);
        }else if(mouseType == 1){
            //不设置高度
            // mercatorVector.y = 0;
            if(_this.polygonParams.pointList.length == 0){
                _this.polygonParams.centerVector = mercatorVector;
                _this.polygonParams.pointList.push(new THREE.Vector3());
                _this.polygonParams.pointNum = 1;
            }else{
                if(_this.polygonParams.pointNum < _this.polygonParams.pointList.length){
                    _this.polygonParams.pointList.pop();
                }
                let mercatorPoint = new THREE.Vector3().subVectors(mercatorVector, _this.polygonParams.centerVector);
                _this.polygonParams.pointList.push(mercatorPoint);
                _this.polygonParams.pointNum++;
            }
            createPolygon1(_this.polygonParams.pointList, _this.polygonParams.centerVector);
        }else if(mouseType == 2){
            if(_this.polygonParams.pointNum < _this.polygonParams.pointList.length){
                _this.polygonParams.pointList.pop();
            }
            createPolygon1(_this.polygonParams.pointList, _this.polygonParams.centerVector);
            if(_this.polygonParams.resolve){
                _this.polygonParams.resolve({polygon: _this.polygonParams.group, pointList: _this.polygonParams.pointList});
                _this.polygonParams.resolve = null;
                _this.polygonParams.reject = null;
            }

            _this.endDrawPolygon();
        }


        function createPolygon1(pointList, centerVector){
            if(!pointList || pointList.length < 2 || !centerVector){
                return;
            }
            let group = _this.polygonParams.group;
            //创建用于保存多边形的group
            if(!group){
                group = new THREE.Group();
                setModelScaleOption(group);
                group.userData.id = _this.polygonParams.polygonId;
                group.position.copy(centerVector);
                if(group.position.z <= 0 ){
                    group.position.z = 0.1;
                }
                _this.world.add(group);
                _this.polygonParams.group = group;
            }
            if(pointList.length == 2){    // 创建line
                let line = null;
                if(_this.polygonParams.line){
                    line = _this.polygonParams.line;
                }
                const geometry = new THREE.BufferGeometry().setFromPoints( pointList );
                if(!line){
                    const material = new THREE.LineBasicMaterial({
                        color: 0x56fb2d
                    });
                    line = new THREE.Line( geometry, material );
                    group.add( line );
                    _this.polygonParams.line = line;
                }else{
                    line.geometry = geometry;
                }
            }else if(pointList.length > 2){
                //移除线
                if(_this.polygonParams.line){
                    group.remove(_this.polygonParams.line);
                    _this.polygonParams.line = null;
                }
                //绘制plane
                let plane = null;
                if(_this.polygonParams.plane){
                    plane = _this.polygonParams.plane;
                }
                let shape = new THREE.Shape();
                shape.moveTo(pointList[0].x, pointList[0].z);//将初始点移动到第一个点位置
                for(let i = 1; i < pointList.length;i++) {
                    shape.lineTo(pointList[i].x, pointList[i].z);//绘制线
                }
                shape.autoClose = true;//自动闭合
                let planeMeshGeometry = new THREE.ShapeBufferGeometry( shape );
                planeMeshGeometry.rotateX(Math.PI/2);
                if(!plane){
                    let planeMaterial = new THREE.MeshBasicMaterial({
                        color: 0x56fb2d,
                        side: THREE.DoubleSide,
                        transparent: true,
                        opacity: 0.5
                    });
                    let plane = new THREE.Mesh(planeMeshGeometry, planeMaterial);
                    group.add( plane );
                    _this.polygonParams.plane = plane;
                }else{
                    plane.geometry = planeMeshGeometry;
                }
            }
        }
    }

    /**
     * 创建水面多边形
     * @param positions [[x, y, z], ...] || [[x, y], ...]      //墨卡托坐标(需要转换为mapbox的伪墨卡托)
     * @param height
     * @param options {color: 0x85d4fd, lightColor: 0xFFFFFF, scale: 4, removeBottomPlane: false, bottomHeight, useTerrainHeight: false, stickTerrain: false, clipBias: 0, flowDirection}
     */
    createWaterPolygon(positions, height, options){
        if(!positions || positions.length < 3){
            return;
        }
        options = options ? options : {};
        let pointList = [];
        height = positions[0][2] ? positions[0][2] : (height || 0);
        let centerCoor = coorTransformUtils.mercatorToThreeLocal(positions[0][0], positions[0][1], height);
        let centerVector = new THREE.Vector3(centerCoor.x, centerCoor.y, centerCoor.z);

        for(let position of positions){
            let pointCoor = coorTransformUtils.mercatorToThreeLocal(position[0], position[1], height);
            let pointVector = new THREE.Vector3(pointCoor.x, pointCoor.y, pointCoor.z);
            pointList.push(new THREE.Vector3().subVectors(pointVector, centerVector));
        }

        if(!pointList || pointList.length < 2 || !centerVector){
            return;
        }
        let group = new THREE.Group();
        group.userData.id = _this.polygonParams.polygonId;
        group.position.copy(centerVector);
        _this.world.add(group);

        if(options.useTerrainHeight){
            setModelUseTerrainHeightOption(group, group.position.y);
        }


        //绘制plane
        let shape = new THREE.Shape();
        shape.moveTo(pointList[0].x, -pointList[0].z);//将初始点移动到第一个点位置
        for(let i = 1; i < pointList.length;i++) {
            shape.lineTo(pointList[i].x, -pointList[i].z);//绘制线
        }
        shape.autoClose = true;//自动闭合
        let planeMeshGeometry = new THREE.ShapeBufferGeometry( shape );
        // planeMeshGeometry.rotateX(-Math.PI/2);
        let water = null;
        let defalutColor = 0x85d4fd;
        let defalutLightColor = 0xFFFFFF;
        //创建水面
        water = new Water( planeMeshGeometry, {
            color: options.color || defalutColor,
            lightColor: options.lightColor || defalutLightColor,
            scale: options.scale || 1,
            flowDirection: options.flowDirection ? options.flowDirection : new THREE.Vector2(1, 1 ),
            textureWidth: 1024,
            textureHeight: 1024,
            encoding: THREE.RGBEEncoding,
            normalMap0: new THREE.TextureLoader().load(waterNormalMap0),
            normalMap1: new THREE.TextureLoader().load(waterNormalMap1),
            clipBias: options.clipBias ? options.clipBias : 0,
            stickTerrain: options.stickTerrain,
            map: options.stickTerrain ? _this.map : null
        } );

        //使用plane旋转
        water.rotation.x = Math.PI * - 0.5;

        _this._assignUVs(water);
        planeMeshGeometry.computeBoundingBox();

        group.add(water)

        if(!options.removeBottomPlane){
            const texture = new THREE.TextureLoader().load( waterBackgroupImage );
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            let planeMaterial = new THREE.MeshBasicMaterial({
                color: options.color || defalutColor,
                map: texture,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 1
            });

            let plane = new THREE.Mesh(planeMeshGeometry, planeMaterial);
            let bottomHeight = 0.3;
            if(options.bottomHeight){
                bottomHeight = options.bottomHeight;
            }
            plane.position.y -= bottomHeight;
            plane.rotation.x = Math.PI * - 0.5;
            group.add( plane );
        }

        _this.waterObj.waterList.push(group);
        if(_this.waterObj.waterList.length == 1){
            _this.waterObj.waterAnimation = true;
            _this._waterPolygonAnimation();
        }
        return group;
    }

    removeWaterPolygon(waterGroup){
        //移除
        for(let i = 0; i < this.waterObj.waterList.length; i++){
            if(_this.waterObj.waterList[i] == waterGroup){
                _this.waterObj.splice(i, 1);
                break;
            }
        }
        _this.world.remove(waterGroup);
        if(_this.waterObj.waterList.length == 0){
            _this.waterObj.waterAnimation = false;
        }
    }

    removeAllWaterPolygon(){
        for(let i = 0; i < this.waterObj.waterList.length; i++){
            _this.world.remove(_this.waterObj.waterList[i]);
        }
        _this.waterObj.waterList = [];
        _this.waterObj.waterAnimation = false;
    }

    _waterPolygonAnimation(){
        if(_this.waterObj.waterAnimation){
            requestAnimationFrame( _this._waterPolygonAnimation );
            //触发刷新事件
            _this.map.triggerRepaint();

            let waterGroupList = _this.getAllWater();
            waterGroupList.forEach(waterGroup => {
                _this._checkloadWater(waterGroup.children[0])
            })
        }
    }
    _checkloadWater(water) {
        let matrixWorldInverse = new THREE.Matrix4();
        matrixWorldInverse.copy(_this.world.matrix).invert();
        let cameraPosition = threejsProperty.cameraSync.cameraPosition;
        let objectBox = new THREE.Box3();
        let dist = null
        objectBox.expandByObject(water)
        objectBox.max = coorTransformUtils.threeWorldToLocal(objectBox.max)
        objectBox.min = coorTransformUtils.threeWorldToLocal(objectBox.min)
        let area = (objectBox.max.y - objectBox.min.y) * (objectBox.max.x - objectBox.min.x);
        let xishu = Math.ceil(area / 50000000);
        if (objectBox.max.x) {
            dist = objectBox.distanceToPoint(cameraPosition);
            if (dist > 50000 * xishu){
                water.visible = false
            }else{
                water.visible = true
            }
        }

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


    /**
     * 绘制单条线段
     * @param id
     * @param material {color: 0x56fb2d, linewidth: 5}
     * @return {Promise<any>}
     */
    drawLine(id, material){
        _this.lineParams.lineId = id;
        _this.lineParams.material = material;
        //设置不能双击缩放
        _this.map.doubleClickZoom.disable();
        //初始化
        _this.lineParams.pointList = [];
        _this.lineParams.group = null;
        _this.lineParams.line = null;
        //鼠标点击事件
        return new Promise((resolve, reject) => {
            _this.lineParams.resolve = resolve;
            _this.lineParams.reject = reject;
            threejsProperty.renderer.domElement.addEventListener('click', _this._onLineClick, false)
            threejsProperty.renderer.domElement.addEventListener('mousemove', _this._onLineMove, false)
            _this.map.on('mousemove', _this.onMapLineMove);
            _this.map.on('click', _this.onMapLineClick);
        });
    }
    endDrawLine(){
        //恢复双击缩放
        setTimeout(function () {
            _this.map.doubleClickZoom.enable();
        }, 1000);
        if(_this.lineParams.reject){
            _this.lineParams.reject("取消绘制");
            _this.lineParams.resolve = null;
            _this.lineParams.reject = null;
        }
        //移除鼠标点击事件
        threejsProperty.renderer.domElement.removeEventListener('click', _this._onLineClick, false)
        threejsProperty.renderer.domElement.removeEventListener('mousemove', _this._onLineMove, false)
        _this.map.off('mousemove', _this.onMapLineMove);
        _this.map.off('click', _this.onMapLineClick);
    }
    _onLineMove(event){
        if(_this.lineParams.centerVector && _this.lineParams.pointList.length > 0) {
            //获取threejs中的点
            let raycaster = new THREE.Raycaster();
            let mouse = new THREE.Vector2();
            mouse.x = (event.offsetX / threejsProperty.renderer.domElement.clientWidth) * 2 - 1;
            mouse.y = -(event.offsetY / threejsProperty.renderer.domElement.clientHeight) * 2 + 1;
            raycaster.setFromCamera(mouse, threejsProperty.camera);
            let intersects = raycaster.intersectObjects(threejsProperty.scene.children, true);
            if (intersects && intersects.length > 0) {
                _this.lineParams.moveRaycasterIntersect = true;

                let intersect = intersects[0];
                let pointVector = intersect.point;
                _this._createLine(pointVector, 0);
            }else{
                _this.lineParams.moveRaycasterIntersect = false;
            }
        }
    }
    _onLineClick(event){
        let errorValue = 5;
        let nowTime = Date.now();
        if(nowTime - _this.lineParams.clickTime < 500
            && event.offsetX > _this.lineParams.offsetX - errorValue && event.offsetX < _this.lineParams.offsetX + errorValue
            && event.offsetY > _this.lineParams.offsetY - errorValue && event.offsetY < _this.lineParams.offsetY + errorValue){
            //双击事件
            return;
        }
        _this.lineParams.clickTime = nowTime;
        _this.lineParams.offsetX = event.offsetX;
        _this.lineParams.offsetY = event.offsetY;
        //获取threejs中的点
        let raycaster = new THREE.Raycaster();
        let mouse = new THREE.Vector2();
        mouse.x = ( event.offsetX / threejsProperty.renderer.domElement.clientWidth ) * 2 - 1;
        mouse.y = - ( event.offsetY / threejsProperty.renderer.domElement.clientHeight ) * 2 + 1;
        raycaster.setFromCamera(mouse, threejsProperty.camera);
        let intersects = raycaster.intersectObjects(threejsProperty.scene.children, true);
        if(intersects && intersects.length > 0){
            _this.lineParams.clickRaycasterIntersect = true;

            let intersect = intersects[0];
            let pointVector = intersect.point;
            _this._createLine(pointVector, 1);
        }else{
            _this.lineParams.clickRaycasterIntersect = false;
        }
    }
    onMapLineMove(e){
        if(!_this.lineParams.moveRaycasterIntersect){
            let pointVector3 = _this.mapboxClickToThreeCoor(e);
            // 处理绘制事件
            _this._createLine(pointVector3, 0);
        }
    }
    onMapLineClick(e){
        if(!_this.lineParams.clickRaycasterIntersect){
            let pointVector3 = _this.mapboxClickToThreeCoor(e);
            // 处理绘制事件
            _this._createLine(pointVector3, 1);
        }
    }
    /**
     * 创建线段
     * @param mouseType 0: move, 1: click
     */
    _createLine(pointVector3, mouseType){
        let mercatorVector = coorTransformUtils.threeWorldToLocal(pointVector3);
        if(mouseType == 0){
            //设置鼠标移动点的位置
            if(_this.lineParams.pointNum < _this.lineParams.pointList.length){
                _this.lineParams.pointList.pop();
            }
            let mercatorPoint = new THREE.Vector3().subVectors(mercatorVector, _this.lineParams.centerVector);
            _this.lineParams.pointList.push(mercatorPoint);
            createLine1(_this.lineParams.pointList, _this.lineParams.centerVector);
        }else if(mouseType == 1){
            if(_this.lineParams.pointList.length == 0){
                _this.lineParams.centerVector = mercatorVector.clone();
                _this.lineParams.pointList.push(new THREE.Vector3(0,0,0));
                _this.lineParams.pointNum = 1;
            }else{
                //完成画线
                if(_this.lineParams.pointNum < _this.lineParams.pointList.length){
                    _this.lineParams.pointList.pop();
                }
                let mercatorPoint = new THREE.Vector3().subVectors(mercatorVector, _this.lineParams.centerVector);
                _this.lineParams.pointList.push(mercatorPoint);
                _this.lineParams.pointNum++;
                createLine1(_this.lineParams.pointList, _this.lineParams.centerVector);
                if(_this.lineParams.resolve){
                    _this.lineParams.resolve({line: _this.lineParams.group, pointList: _this.lineParams.pointList});
                    _this.lineParams.resolve = null;
                    _this.lineParams.reject = null;
                }
                _this.endDrawLine();
            }
        }

        function createLine1(pointList, centerVector){
            if(!pointList || pointList.length < 2 || !centerVector){
                return;
            }
            let group = _this.lineParams.group;
            //创建用于保存多边形的group
            if(!group){
                group = new THREE.Group();
                group.userData.id = _this.lineParams.lineId;
                group.position.copy(centerVector);
                setModelScaleOption(group);
                _this.world.add(group);
                _this.lineParams.group = group;
            }
            if(pointList.length == 2){    // 创建line
                let line = null;
                if(_this.lineParams.line){
                    line = _this.lineParams.line;
                }
                var geometry = new LineGeometry()
                var pointArr = []
                for(let point of pointList){
                    pointArr.push(point.x);
                    pointArr.push(point.y);
                    pointArr.push(point.z);
                }
                geometry.setPositions(pointArr)
                if(!line){
                    let color = 0x56fb2d;
                    let linewidth = 5;
                    if(_this.lineParams.material){
                        color = _this.lineParams.material.color || color;
                        linewidth = _this.lineParams.material.linewidth || linewidth;
                    }
                    const material = new LineMaterial({
                        color: color,
                        linewidth: linewidth
                    });
                    material.resolution.set(threejsProperty.renderer.domElement.clientWidth, threejsProperty.renderer.domElement.clientHeight)
                    line = new Line2( geometry, material );
                    group.add( line );
                    _this.lineParams.line = line;
                }else{
                    line.geometry = geometry;
                }
            }
        }
    }
    /**
     *
     * @param pointList
     * @param mateial
     * @return {*}
     */
    createLineByMercator(pointList, materialOption){
        if(!pointList || pointList.length < 2){
            return;
        }
        let centerVector = new THREE.Vector3().copy(pointList[0]);
        let createPointList = [];
        for(let point of pointList){
            createPointList.push(new THREE.Vector3().subVectors(point, centerVector));
        }
        //创建用于保存多边形的group
        let group = new THREE.Group();
        setModelScaleOption(group);
        group.position.copy(centerVector);
        _this.world.add(group);
        // 创建line
        if(createPointList && createPointList.length >= 2){
            var geometry = new LineGeometry()
            var pointArr = []
            for(let point of createPointList){
                pointArr.push(point.x);
                pointArr.push(point.y);
                pointArr.push(point.z);
            }
            geometry.setPositions(pointArr);

            let color = 0x56fb2d;
            let linewidth = 5;
            if(materialOption){
                color = materialOption.color || color;
                linewidth = materialOption.linewidth || linewidth;
            }
            const material = new LineMaterial({
                color: color,
                linewidth: linewidth
            });
            material.resolution.set(threejsProperty.renderer.domElement.clientWidth, threejsProperty.renderer.domElement.clientHeight)
            let line = new Line2( geometry, material );
            group.add( line );
        }
        // threejsProperty.cameraSync.updateCamera();
        return group;
    }


    //点击绘制箱子
    drawBoxByRay() {
        threejsProperty.renderer.domElement.addEventListener('pointerdown', _this._onDrawBoxClick, false)
        _this.map.on('click', _this.onMapBoxClick);
        let geometry = new THREE.BoxGeometry( 10, 10, 10 );
        let material = new THREE.MeshBasicMaterial( {color: 0x00ff00} );
        let cube = new THREE.Mesh( geometry, material );
        _this.boxParams.object = cube;
    }
    removeDrawBoxByRay(){
        threejsProperty.renderer.domElement.removeEventListener('pointerdown', _this._onDrawBoxClick, false);
        _this.map.off('click', _this.onMapBoxClick);
        _this.boxParams.objec = null;
    }
    _onDrawBoxClick( event ) {
        let raycaster = new THREE.Raycaster();
        let mouse = new THREE.Vector2();
        mouse.x = ( event.clientX / threejsProperty.renderer.domElement.clientWidth ) * 2 - 1;
        mouse.y = - ( event.clientY / threejsProperty.renderer.domElement.clientHeight ) * 2 + 1;
        raycaster.setFromCamera(mouse, threejsProperty.camera);
        let intersects = raycaster.intersectObjects(threejsProperty.scene.children, true);
        if(intersects && intersects.length > 0){
            _this.boxParams.raycasterIntersect = true;

            let intersect = intersects[0];
            let pointVector3 = intersect.point;

            //添加到地图中
            _this.addObjectToWorld(_this.boxParams.object, pointVector3);
            //结束绘制
            _this.removeDrawBoxByRay();
        }else{    //使用mapbox的点击事件获取点击位置
            _this.boxParams.raycasterIntersect = false;
        }
    }
    onMapBoxClick(e){
        if(!_this.boxParams.raycasterIntersect){
            let pointVector3 = _this.mapboxClickToThreeCoor(e);

            //添加到地图中
            _this.addObjectToWorld(_this.boxParams.object, pointVector3);
            //结束绘制
            _this.removeDrawBoxByRay();
        }
    }
    mapboxClickToThreeCoor(e){
        let lngLat = e.lngLat;
        let elevation = _this.map.queryTerrainElevation(lngLat, { exaggerated: false });
        elevation = elevation ? elevation : 0;
        let worldVector = coorTransformUtils.wgs84ToThreeWorld(lngLat.lng, lngLat.lat, elevation);
        return worldVector;
    }


    /**
     * 添加object到world中
     * @param object THREE.Object3D
     * @param position THREE.Vector3 threejs中的世界坐标
     * @param noCastShadow 不添加阴影
     */
    addObjectToWorld(object, position, noCastShadow){
        if(!_this.world){
            console.error("请先调用init函数初始化");
            return;
        }
        if(object && position && position instanceof THREE.Vector3){
            _this.world.add( object );
            //添加阴影
            if(!noCastShadow){
                _this.addCastShadow(object);
            }

            //计算缩放
            let scaleVector = new THREE.Vector3().setFromMatrixScale(threejsProperty.mercatorWorld.matrix.clone());
            object.scale.copy(scaleVector);

            let originMatrix = new THREE.Matrix4().copy(threejsProperty.mercatorWorld.matrix).invert();
            //计算偏移量
            let tranformsMatrix = new THREE.Matrix4().setPosition(position);
            originMatrix.multiply(tranformsMatrix);
            //矩阵应用到object
            object.applyMatrix4(originMatrix.clone());
            /*object.updateMatrix()
            object.updateMatrixWorld(true)
            object.updateWorldMatrix(true, true)*/
            threejsProperty.cameraSync.updateCamera();
        }
    }

    /**
     * 通过id获取多边形
     * @param id
     */
    getObjectById(id){
        if(!id){
            return;
        }
        if(!_this.world){
            console.error("请先调用init函数初始化");
            return;
        }
        if(_this.world.children && _this.world.children.length > 0){
            for(let child of _this.world.children){
                if(child && child.userData && child.userData.id == id){
                    return child;
                }
            }
        }
    }
    removeObjectById(id){
        let polygon = _this.getObjectById(id);
        if(polygon){
            _this.world.remove(polygon);
            threejsProperty.cameraSync.updateCamera();
        }
    }
    /**
     * 移除指定object
     * @param obejct
     */
    removeObject(_obejct){
        if(!_this.world){
            console.error("请先调用init函数初始化");
            return;
        }
        if(_obejct){
            _this.world.remove(_obejct);
            threejsProperty.cameraSync.updateCamera();
        }
    }
    removeAll(){
        if(_this.world){
            _this.world.clear();
            threejsProperty.cameraSync.updateCamera();
        }
    }

    //创建world用于绘制
    createWorldGroup(){
        if(!_this.world){
            _this.world = new THREE.Group();
            _this.world.name = _this.worldName;
            threejsProperty.mercatorWorld.add(_this.world);
            threejsProperty.worlds.push(_this.world);
        }
    }
    getWorldGroup(){
        return _this.world;
    }
    getAllWater(){
        let waterGroupList = []
        _this.world.children.forEach(object => {
            if (object.userData.type == 'draw-water'){
                waterGroupList.push(object)
            }
        })
        return waterGroupList
    }
    //移除world, 销毁时调用
    removeWorldGroup(){
        if(_this.world){
            _this.removeAllWaterPolygon();
            for(let index in threejsProperty.worlds){
                let world = threejsProperty.worlds[index];
                if(world == _this.world){     //移除当前绘制图层
                    threejsProperty.worlds.splice(index, 1)
                    break;
                }
            }
            threejsProperty.mercatorWorld.remove(_this.world);
            threejsProperty.cameraSync.updateCamera();
            _this.world = null;
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
                    _this.addCastShadow(child);
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
                    _this.removeCastShadow(child);
                }
            }
        }
    }

    highlightModel(layer) {
        let meshGroup = new THREE.Group()
        meshGroup.name = 'highlightGroup'
        let modelGroup = layer.implementation.tileset.root.totalContent
        var box3 = new THREE.Box3()
        box3.expandByObject(modelGroup)
        var v3 = new THREE.Vector3()
        box3.getSize(v3)
        let radius = Math.sqrt(Math.pow(v3.x/2, 2) + Math.pow(v3.z/2, 2))
        // var boxGeometry = new THREE.BoxGeometry(v3.x, v3.z, v3.y);
        // const boxEdges = new THREE.EdgesGeometry( boxGeometry );
        // const boxLine = new THREE.LineSegments( boxEdges, new THREE.LineBasicMaterial( { color: 0x00ff00} ) );

        // 生成高亮几何网格
        var cylinder = new THREE.CylinderGeometry(radius + 1, radius + 1, v3.y, 50, 1, true)
        const ring = new THREE.CircleGeometry( radius + 2 + 1, 50 );
        const texture = new THREE.TextureLoader().load(highlightAlphaMap)
        const gradientMaterial = new THREE.MeshBasicMaterial({
            alphaMap: texture,
            color: 0x1b8087,
            transparent: true,
            opacity: 0.9,
            // emissive: 0x889696,
            // side:THREE.DoubleSide,
        });

        const ringMaterial = new THREE.MeshPhongMaterial({
            color: 0x093f43,
            transparent: true,
            opacity: 0.7,
            emissive: 0x093f43
        });
        const cylinderMesh = new THREE.Mesh(cylinder, gradientMaterial);
        cylinderMesh.name = 'highlightCylinder'
        const ringMesh = new THREE.Mesh(ring, ringMaterial);
        ringMesh.name = 'highlightRing'
        ringMesh.rotateX(Math.PI/2)

        // 计算坐标位置
        let center = new THREE.Vector3();
        box3.getCenter(center)
        let translateY = center.y
        ringMesh.translateZ(translateY)  // 平移圆圈中心贴到地面
        // cylinderMesh.translateZ(2)

        meshGroup.add(cylinderMesh)
        meshGroup.add(ringMesh)
        _this.highlightGroup = meshGroup
        _this.addObjectToWorld(meshGroup, center, true, true)
        // _this.addObjectToWorld(cylinderMesh, center, true, true)
        // _this.addObjectToWorld(ringMesh, Rcenter, true, true)
    }


    removeHighlight(){
        if (_this.highlightGroup){
            _this.world.remove(_this.highlightGroup);
            _this.highlightGroup = null
        }
    }


}
export default ThreejsDrawUtils;
