import * as THREE from "three";
import ResourceTracker from "../utils/resourceTracker";
// 定义resMgr和track用来清理three
let resMgr = new ResourceTracker();
import threejsProperty from "../manage/threejsProperty";
import CoorTransformUtils from "../utils/CoorTransformUtils";

/**
 * 模仿Cesium的ClassificationPrimitive功能进行实现
 *
 *  实现步骤：
 * 1、传入一个经纬度坐标的多边形， 设置底部高度， 顶部高度
 * 2、通过多边形获取到一个以墨卡托坐标为基准的Box3
 * 3、加入要进行处理的Mapbox3DTilesLayer
 * 4、获取在Box3范围内的mesh， 材质全部替换成自定义glsl着色器的东西
 * 5、在多边形范围内的片元才渲染颜色， 范围外的渲染为透明色
 *
 *  使用方法：
 * let classificationPrimitive = new ClassificationPrimitive({
 *     polygon: {positions: [[lng, lat],[lng, lat], ...], bottomHeight: 底部高度, topHeight: 顶部高度 },
 *     color: THREE.Color                                     //defalut: new THREE.Color( 0xffffff );
 *     colorAlpha: 0.7                                        //value: (0~1), defalut: 0.7
 * })
 * Mapbox3DTilesLayer.setClassificationPrimitive(classificationPrimitive)
 *
 * @author lidy
 * @since 2021-08-17 15:45
 */
class ClassificationPrimitive{
    constructor(params) {
        this.world = null;
        this.group = null;
        this.meshMapper = {};     //mesh的映射 {uuid: Mesh, ...}
        this.worldName = "ClassificationPrimitive";
        this.material = null;
        this.renderEventId = null;
        if(!params){throw new Error('参数不能为空');}
        if(!params.polygon){throw new Error('polygon参数不能为空');}
        if(!params.polygon.positions || !(params.polygon.positions.length >= 3)){throw new Error('polygon参数不符合多边形的点数据');}

        this.polygon = params.polygon;
        this.polygon.bottomHeight = this.polygon.bottomHeight || 0;
        this.polygon.topHeight = this.polygon.topHeight > this.polygon.bottomHeight ?  this.polygon.topHeight :  this.polygon.bottomHeight;
        //保存threejs世界坐标下的多边形点位   positions, mercatorPositions
        this.polygon.threePositions = [];

        this.color = (params.color && params.color instanceof THREE.Color) ? params.color.clone() : new THREE.Color(0xffffff);
        this.colorAlpha = (params.colorAlpha != null && params.colorAlpha >= 0 && params.colorAlpha <= 1) ? params.colorAlpha : 0.7;

        this.box3 = null;

        this.vertexShader = '';
        this.fragmentShader = '';

        this.coorTransformUtils = new CoorTransformUtils(threejsProperty);

        this._init();
    }
    //初始化
    _init(){
        this.createWorldGroup();
        //处理坐标系转换
        this._initPolygonHandle();

        // 执行ClassificationPrimitive的逻辑
        this._createBox3();
        this._createShader();
        this._createMaterial();
    }
    //销毁
    destroy(){
        this.removeWorldGroup();
        this._disposeMaterial();
        threejsProperty.cameraSync.updateCamera();
    }

    /**
     * 创建shader
     */
    _createShader(){
        let positionLength = this.polygon.positions.length;
        this.vertexShader = `
            attribute float size;
            
            varying vec4 worldPosition;
        
            void main() {
                
                vec4 modelPosition =  modelMatrix * vec4( position, 1.0 );
                worldPosition = modelPosition;
                
                vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
                gl_Position = projectionMatrix * mvPosition;
                
            }
        `;
        this.fragmentShader = `
            const int positionLength = ${positionLength};
        
            uniform vec3 color;
            uniform float bottomHeight;
            uniform float topHeight;
            uniform vec3 positions[positionLength];
            
            varying vec4 worldPosition;
            
            bool insidePolygon(vec4 point) {
                float x = point.x;
                float y = point.z;
                bool inside = false;
                vec3 positionOld = positions[0];
                for(int i = 1; i < positionLength; ++i) {
                    vec3 position = positions[i];
                    float x1 = position.x, y1 = position.z;
                    float x2 = positionOld.x, y2 = positionOld.z;
                    bool intersect = ((y1 > y) != (y2 > y)) && (x < (x2 - x1) * (y - y1) / (y2 - y1) + x1);
                    if (intersect){
                        inside = !inside;
                    }
                    positionOld = position;
                }
                
                vec3 position = positions[0];
                float x1 = position.x, y1 = position.y;
                float x2 = positionOld.x, y2 = positionOld.y;
                bool intersect = ((y1 > y) != (y2 > y)) && (x < (x2 - x1) * (y - y1) / (y2 - y1) + x1);
                if (intersect){
                    inside = !inside;
                }
                
                return inside;
            }
            
            void main() {
                bool show = false;
                if(worldPosition.y >= bottomHeight && worldPosition.y <= topHeight){
                    if(insidePolygon(worldPosition)){
                        show = true;
                    }
                }
                if(show){
                    gl_FragColor = vec4( color, 1.0 );
                }
            }
        `;
    }

    //修改bottomHeight和topHeight
    setPolygonHeight(bottomHeight, topHeight){
        if(this.polygon){
            this.polygon.bottomHeight = bottomHeight != null ? bottomHeight : this.polygon.bottomHeight;
            this.polygon.topHeight = topHeight != null ? topHeight : this.polygon.topHeight;
            this._createBox3();
        }
        if(this.material){
            // 调整material
            this.material.uniforms.bottomHeight.value =  this.polygon.bottomHeight;
            this.material.uniforms.topHeight.value =  this.polygon.topHeight;
        }

        threejsProperty.cameraSync.updateCamera();
    }

    //创建box3
    _createBox3(){
        this.box3 = new THREE.Box3().setFromPoints(this.polygon.threePositions);
        this.box3.min.y = this.polygon.bottomHeight;
        this.box3.max.y = this.polygon.topHeight;
    }
    _createMaterial(){
        if(!this.material){
            // this.material = new THREE.MeshBasicMaterial( {color: this.color, transparent: true, opacity: this.colorAlpha} );
            this.material = new THREE.ShaderMaterial( {
                uniforms: {
                    color: { value: this.color },
                    bottomHeight: {value: this.polygon.bottomHeight},
                    topHeight: {value: this.polygon.topHeight},
                    positions: {value: this.polygon.threePositions},
                    positionLength: {value: this.polygon.positions.length},
                },
                uniformsNeedUpdate: true,    //强制更新
                vertexShader: this.vertexShader,
                fragmentShader: this.fragmentShader,
                blending: THREE.AdditiveBlending,
                depthTest: true,      //true: 被遮挡的不显示
                transparent: true,
                opacity: this.colorAlpha
            } );
        }
    }

    _disposeMaterial(){
        if(this.material){
            this.material.dispose();
        }
        this.material = null;
    }


    _addMeshToMapper(uuid, mesh){
        if(!this.meshMapper[uuid]){
            this.meshMapper[uuid] = [];
        }
        this.meshMapper[uuid].push(mesh);
    }
    _getMeshsByUuid(uuid){
        if(uuid){
            return this.meshMapper[uuid];
        }
    }
    _removeAllMapper(){
        this.meshMapper = {};
    }

    addMesh(_group){
        let _this = this;
        let worldMatrix = threejsProperty.mercatorWorld.matrix;
        let worldMatrixInvert = new THREE.Matrix4().copy(worldMatrix).invert();
        let threeWorldBox3 = this.box3.clone();
        if(!this.group){
            this.group = new THREE.Group();
            this.group.applyMatrix4(worldMatrixInvert);
            this.world.add(this.group);
        }
        let groupMatrixInvert = new THREE.Matrix4().copy(this.group.matrixWorld).invert();
        let uuid = _group.uuid;
        let meshList = _this._getMeshsByUuid(uuid);
        if(meshList){
            for(let meshObject of meshList){
                meshObject.visible = true;
            }
        }else{
            addMeshToGroup(_group);
        }

        function addMeshToGroup(object){
            let box = new THREE.Box3().expandByObject(object);
            if(threeWorldBox3.intersectsBox(box)){
                if(object && object instanceof THREE.Mesh && object.visible){
                    let _object = object.clone();
                    _object._uuid = uuid;
                    _this._addMeshToMapper(uuid, _object);

                    let matrix4 = groupMatrixInvert.clone().multiply(_object.matrixWorld);
                    _object.applyMatrix4(matrix4);
                    _object.material = _this.material;
                    _this.group.add(_object);
                }
                if(object && object.children && object.children.length > 0){
                    for(let i = 0; i < object.children.length; i++){
                        addMeshToGroup(object.children[i])
                    }
                }
            }
        }
    }
    removeMesh(_group){
        if(!this.group){
            return;
        }
        let uuid = _group.uuid;
        let meshList = this._getMeshsByUuid(uuid);
        if(meshList){
            for(let meshObject of meshList){
                meshObject.visible = false;
            }
        }
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
            this._removeAllMapper();
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

    //初始化多边形坐标的处理（经纬度 - 墨卡托 - threejs世界坐标）
    _initPolygonHandle(){
        if(this.polygon) {
            if (this.polygon.mercatorPositions && !this.polygon.positions) {
                this.polygon.positions = [];
                for (let mercator of this.polygon.mercatorPositions) {
                    let lngLat = this.coorTransformUtils.mercatorToWgs84(mercator[0],mercator[1]);
                    this.polygon.positions.push([lngLat.lng, lngLat.lat]);
                }
            }
            if(this.polygon.positions) {
                if(this.polygon.positions[0][0] != this.polygon.positions[this.polygon.positions.length - 1][0]){
                    this.polygon.positions.push(this.polygon.positions[0]);
                }
                //生成threejsPosition
                this._createThreePosition();
            }
        }
    }
    _createThreePosition(){
        //生成threejsPosition
        this.polygon.threePositions = [];
        if(this.polygon.positions){
            for(let lngLat of this.polygon.positions){
                let worldVector = this.coorTransformUtils.wgs84ToThreeWorld(lngLat[0], lngLat[1], 0);
                this.polygon.threePositions.push(worldVector);
            }
        }
    }

    //刷新数据
    refreshThreePosition(){
        this._createThreePosition();
        this._createBox3();
    }
}
export default ClassificationPrimitive;

