/**
 * 管理Threejs与mapbox框架之间的逻辑
 */
import InitThreejsLayer from "./InitThreejsLayer";
import ResourceTracker from "../utils/resourceTracker";
import * as THREE from "three";

// 定义resMgr和track用来清理three
let resMgr = new ResourceTracker();
const track = resMgr.track.bind(resMgr);

class ThreejsManage{
    constructor(map, threejsProperty) {
        this.map = map;
        //自定义mapbox图层，用于创建threejs，以及渲染threejs
        this.initThreejsLayer = null;
        //用于保存threejs的属性
        this.threejsProperty = threejsProperty;
        this.threejsProperty.isDispose = false;

        //初始化
        this.initThreejsLayer = new InitThreejsLayer(this.threejsProperty);
        this.map.addLayer(this.initThreejsLayer);
    }

    /**
     * 更新场景状态（执行cameraSync.updateCamera）
     */
    updateSceneState(){
        this.threejsProperty.cameraSync.updateCallback();
    }

    /**
     * 销毁
     */
    dispose(){
        let threejsProperty = this.threejsProperty;
        threejsProperty.isDispose = true;
        //销毁图层

        //销毁场景
        disposeThreejsScene();

        /**
         * 销毁threejs场景
         */
        function disposeThreejsScene(){
            try {
                track(threejsProperty.scene)
                resMgr && resMgr.dispose()

                threejsProperty.camera = null;
                threejsProperty.cameraSync = null;
                threejsProperty.lights = null;

                let gl = threejsProperty.renderer.domElement.getContext("webgl");
                gl && gl.getExtension("WEBGL_lose_context").loseContext();

                threejsProperty.renderer.dispose();
                threejsProperty.renderer.domElement = null;
                threejsProperty.renderer.forceContextLoss();
                threejsProperty.renderer.content = null;
                threejsProperty.renderer = null;
                if(threejsProperty.highlightUtils){
                    threejsProperty.highlightUtils.dispose();
                    threejsProperty.highlightUtils = null;
                }
                threejsProperty.tilesetLayers = [];
                threejsProperty.scene.traverse((child) => {
                    if (child.material) {
                        child.material.dispose();
                    }
                    if (child.geometry) {
                        child.geometry.dispose();
                    }
                    child = null;
                });
                threejsProperty.scene.clear();
                threejsProperty.scene = null;
                // threejsProperty = null;
            }catch (e) {
                console.error(e)
            }
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
     * @param eventId
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

export default ThreejsManage;
