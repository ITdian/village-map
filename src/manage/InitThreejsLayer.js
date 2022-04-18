import * as THREE from "three";
import CoorTransformUtils from "../utils/CoorTransformUtils";
import HighlightUtils from "../utils/HighlightUtils";
import ThreejsCameraSync from "./ThreejsCameraSync";
import AgLayerEnum from "../enum/AgLayerEnum";
const agLayerEnum = new AgLayerEnum();

class InitThreejsLayer {
    constructor(threejsProperty) {
        this.id = agLayerEnum.defaultLayerEnum.initThreejsLayer;
        this.loadStatus = 0;
        this.type = 'custom';
        this.renderingMode = '3d';
        this.threejsProperty = threejsProperty;
        this.cameraSync = null;
        this.map = null;
        this.lights = this.getDefaultLights();
        this.coorTransformUtils = new CoorTransformUtils();
    }

    getDefaultLights() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        let hemiLight = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.8);
        let dirLight = new THREE.DirectionalLight(0xffffff, 0.5);

        dirLight.color.setHSL(0.1, 1, 0.95);
        dirLight.position.set(-1, 1, -1.75);
        dirLight.position.multiplyScalar(100);
        // dirLight.castShadow = true;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 1000;
        dirLight.shadow.bias = 0.0038;
        dirLight.shadow.mapSize.width = width * 100;
        dirLight.shadow.mapSize.height = height * 100;
        dirLight.shadow.camera.left = -width;
        dirLight.shadow.camera.right = width;
        dirLight.shadow.camera.top = -height;
        dirLight.shadow.camera.bottom = height;

        return [hemiLight, dirLight];
    }

    loadVisibleTiles() {
        let tilesetLayers = this.threejsProperty.tilesetLayers
        for (let index = 0; index < tilesetLayers.length; index++) {
            const element = tilesetLayers[index];
            if (element.tileset && element.tileset.root) {
                element.tileset.root.checkLoad(this.cameraSync.frustum, this.cameraSync.cameraPosition, Date.now());
            }
        }
    }

    onAdd(map, gl) {
        this.map = map;
        //初始化three场景

        this.initThreejs(map, gl);
        let threejsProperty = this.threejsProperty;
        if (threejsProperty && threejsProperty.mercatorWorld) {
            this.scene = threejsProperty.scene
            this.renderer = threejsProperty.renderer
            this.composer = threejsProperty.composer
            this.camera = threejsProperty.camera
            this.cameraSync = threejsProperty.cameraSync
        }

        /* END OF WIP */
        this.cameraSync.updateCamera()
    }

    /**  2021-07-28 13:48  xiequan  设置Three场景为全局变量，有则直接用，无则新建 start */
    initThreejs(map, gl) {
        let threejsProperty = this.threejsProperty;
        const fov = 36.8;
        const aspect = map.getCanvas().width / map.getCanvas().height;
        const near = 0.1;
        const far = Infinity;
        // create perspective camera, parameters reinitialized by CameraSync

        threejsProperty.scene = new THREE.Scene();
        threejsProperty.camera = new THREE.PerspectiveCamera(fov, aspect, near, far);

        let centerLngLat = map.transform.center;
        let mapboxMercatorObj = this.coorTransformUtils.wgs84ToMapboxMercator(centerLngLat.lng, centerLngLat.lat);
        let worldScale = mapboxMercatorObj.scale;
        let worldPosition = this.coorTransformUtils.wgs84ToThreeLocal(centerLngLat.lng, centerLngLat.lat, 0, worldScale);
        let worldMercatorCoor = {x: mapboxMercatorObj.x, y: mapboxMercatorObj.y, z: mapboxMercatorObj.z};
        threejsProperty.worldParams.lnglat = centerLngLat;
        threejsProperty.worldParams.scale = worldScale;
        threejsProperty.worldParams.position = worldPosition;
        threejsProperty.worldParams.mercatorCoor = worldMercatorCoor;

        const mercatorWorld = new THREE.Group();
        mercatorWorld.name = 'mapboxMercator';
        mercatorWorld.position.copy(new THREE.Vector3(-worldPosition.x, -worldPosition.y, -worldPosition.z));
        threejsProperty.scene.add(mercatorWorld);
        threejsProperty.mercatorWorld = mercatorWorld;

        this.lights.forEach((light) => {
            threejsProperty.scene.add(light);
            if (light.shadow && light.shadow.camera) ;
        });
        threejsProperty.lights = this.lights

        threejsProperty.renderer = new THREE.WebGLRenderer({
            alpha: true,
            antialias: true,
            canvas: map.getCanvas(),
            context: gl
        });

        threejsProperty.renderer.shadowMap.enabled = true;
        // threejsProperty.renderer.shadowMap.type = THREE.PCFShadowMap;
        threejsProperty.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        threejsProperty.renderer.autoClear = false;
        //定义渲染器的输出编码。默认值为 THREE.LinearEncoding。
        threejsProperty.renderer.outputEncoding = THREE.sRGBEncoding;

        //初始化高亮工具
        let highlightUtils = new HighlightUtils();
        highlightUtils.init(threejsProperty.renderer, threejsProperty.scene, threejsProperty.camera);
        threejsProperty.composer = highlightUtils.getComposer();
        threejsProperty.highlightUtils = highlightUtils;

        threejsProperty.cameraSync = new ThreejsCameraSync(this.map, this.threejsProperty);
        this.cameraSync = threejsProperty.cameraSync;
        threejsProperty.cameraSync.updateCallback = () => this.loadVisibleTiles();

    }
    /**  2021-07-28 13:48  xiequan  设置Three场景为全局变量，有则直接用，无则新建 end */

    onRemove(){

    }

    render(gl, viewProjectionMatrix) {
        let threejsProperty = this.threejsProperty;
        //将viewProjectionMatrix保存到cameraSync类中
        this.cameraSync.viewProjectionMatrix = viewProjectionMatrix;
        //触发相机变更事件
        this.cameraSync.updateCamera();

        /**  2021-08-19 15:33 lidy 执行渲染前的事件 start */
        if(threejsProperty.renderBoforeList){
            for(let key in threejsProperty.renderBoforeList){
                threejsProperty.renderBoforeList[key]();
            }
        }
        /**  2021-08-19 15:33 lidy 执行渲染前的事件 end */


        //执行渲染
        this.renderer.resetState();
        this.renderer.render(this.scene, this.camera);
        if(threejsProperty && threejsProperty.highlightUtils && threejsProperty.highlightUtils.hasSelectedObjects()){     //存在高亮工具的，使用混合渲染器渲染
            threejsProperty.highlightUtils.renderHighlightComposer(this.renderer);
        }
    }
    /**
     * 2021-08-19 15:30 lidy 添加render渲染前的操作
     * @param event
     * @return eventId
     */
    addRenderBeforeEvent(event){
        let threejsProperty = this.threejsProperty;
        if(event instanceof Function && threejsProperty && threejsProperty.renderBoforeList){
            let uuid = THREE.MathUtils.generateUUID();
            threejsProperty.renderBoforeList[uuid] = event;
            return uuid;
        }
    }
    /**
     * 2021-08-19 15:30 lidy 移除render渲染前的操作
     * @param event
     * @return
     */
    removeRenderBoforeEvent(eventId){
        let threejsProperty = this.threejsProperty;
        if(eventId && threejsProperty && threejsProperty.renderBoforeList && threejsProperty.renderBoforeList[eventId]){
            delete threejsProperty.renderBoforeList[eventId];
            return true;
        }
    }
}

export default InitThreejsLayer;
