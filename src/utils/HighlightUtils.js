import * as THREE from 'three';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';
import {EffectComposer} from "three/examples/jsm/postprocessing/EffectComposer";
import threejsProperty from "../manage/threejsProperty";

import ResourceTracker from "../utils/resourceTracker";
// 定义resMgr和track用来清理three
let resMgr = new ResourceTracker();

class HighlightUtils {
    constructor() {
        this.world = null;
        this.worldName = "Highlight-" + new Date().getTime();

        this.params = {
            edgeStrength: 7,
            edgeGlow: 0,
            edgeThickness: 1,
            pulsePeriod: 0,
            // rotate: false,
            // usePatternTexture: false,
            visibleEdgeColor: '#00ff1e',
            hiddenEdgeColor: '#2bff00',
        };
        this.selectedObjects = [];
        this.composer = null;
        this.outlinePass = null;

        this.highlightNames = [];
    }

    init(renderer, scene, camera){
        //创建效果组合器
        this._createComposer(renderer);
        //创建线框效果渲染
        this._createOutlinePass(scene, camera);

        this.createWorldGroup();
    }

    /**
     * 创建效果组合器
     */
    _createComposer(renderer){
        if(!this.composer){
            //定义效果组合器渲染
            const parameters = {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat,
                encoding: THREE.sRGBEncoding,
                stencilBuffer: true,
            };
            const size = renderer.getSize( new THREE.Vector2() );
            this._pixelRatio = renderer.getPixelRatio();
            this._width = size.width;
            this._height = size.height;
            let renderTarget = new THREE.WebGLRenderTarget( this._width * this._pixelRatio, this._height * this._pixelRatio, parameters );
            renderTarget.texture.name = 'EffectComposer.rt1';
            this.composer = new EffectComposer( renderer, renderTarget );
        }
    }

    /**
     * 创建线框渲染
     * @param scene
     * @param camera
     * @private
     */
    _createOutlinePass(scene, camera){
        if(this.composer && !this.outlinePass){
            let outlinePass = new OutlinePass( new THREE.Vector2( this.composer._width, this.composer._height ), scene, camera );
            //设置线框效果
            let params = this.params;
            outlinePass.edgeStrength = Number(params.edgeStrength);
            outlinePass.edgeGlow = Number(params.edgeGlow);
            outlinePass.edgeThickness = Number(params.edgeThickness);
            outlinePass.pulsePeriod = Number(params.pulsePeriod);
            outlinePass.visibleEdgeColor.set(params.visibleEdgeColor);
            outlinePass.hiddenEdgeColor.set(params.hiddenEdgeColor);
            outlinePass.materialCopy = new THREE.ShaderMaterial( {
                uniforms: outlinePass.copyUniforms,
                vertexShader: CopyShader.vertexShader,
                fragmentShader: CopyShader.fragmentShader,
                // blending: THREE.NoBlending,
                depthTest: false,
                depthWrite: false,
                transparent: true
            } );
            this.composer.addPass( outlinePass );
            this.outlinePass = outlinePass;
        }
    }

    getComposer(){
        return this.composer;
    }

    /**
     * 渲染高亮
     * @param renderer
     */
    renderHighlightComposer(renderer){
        //composer的画布
        const currentRenderTarget = renderer.getRenderTarget();
        renderer.setRenderTarget( this.composer.readBuffer );
        renderer.clear(true, true, true);
        renderer.setRenderTarget( currentRenderTarget );

        //混合器渲染
        this.composer.render();
    }

    /**
     * 销毁
     */
    dispose(){
        if(this.composer){
            if(this.outlinePass){
                this.composer.removePass(this.outlinePass);
                this.outlinePass.dispose();
                this.outlinePass = null;
            }

            this.composer = null;
        }
        this.selectedObjects = [];
    }

    /**
     * 修改高亮配置参数
     * @param params
     */
    setParams(params){
        if(params && this.outlinePass){
            for(let key in params){
                if(key == "visibleEdgeColor" || key == "hiddenEdgeColor"){
                    this.outlinePass[key].set(params[key]);
                } else if(this.params.hasOwnProperty(key)){
                    this.params[key] = params[key];
                    // 设置渲染器参数
                    this.outlinePass[key] = Number(params[key]);
                }
            }
        }
    }

    /**
     * 设置高亮的object
     * @param object
     * @param highlightMesh 是否设置模型高亮
     */
    setSelectedObject(object, highlightMesh = false){
        if(object){
            this.selectedObjects = [object];
            this._updatePassSelectedObjects();
            if (highlightMesh){
                this.highlightMesh(object)
            }
        }
    }

    /**
     * 设置高亮的多个object
     * @param object
     */
    setSelectedObjects(objects){
        if(objects && objects.length > 0){
            this.selectedObjects = objects;
            this._updatePassSelectedObjects();
        }
    }

    /**
     * 添加高亮的object
     * @param object
     */
    addSelectedObject(object){
        if(object){
            this.selectedObjects.push(object);
            this._updatePassSelectedObjects();
        }
    }

    /**
     * 移除高亮的object
     * @param object
     */
    removeSelectedObject(object){
        this.selectedObjects = this.selectedObjects.filter(item => item != object);
        this._updatePassSelectedObjects();
    }

    /**
     * 移除所有高亮的object
     */
    removeAllSelectObjects(){
        this.selectedObjects = [];
        this._updatePassSelectedObjects();
        this.clearhighlightMeshes();
    }

    /**
     * 设置渲染器的selectedObjects
     * @private
     */
    _updatePassSelectedObjects(){
        if(this.outlinePass){
            this.outlinePass.selectedObjects = this.selectedObjects;
        }
    }

    hasSelectedObjects(){
        if(this.selectedObjects && this.selectedObjects.length > 0){
            return true;
        } else {
            return false;
        }
    }

    /**
     * 设置模型mesh高亮
     * @param object
     */
    highlightMesh(object){

        let highlightName = 'highlight-' + object.uuid;

        if(this.highlightName.includes(highlightName)){
            return;
        }

        this.clearhighlightMeshes();
        this.highlightNames.push(highlightName);

        let highlightMaterial = new THREE.MeshBasicMaterial({color: 0x00ff00, transparent: true, opacity: 0.3, side: THREE.DoubleSide})
        let highlightObject = object.clone()
        highlightObject.name = highlightName
        highlightObject.traverse(child => {
            if (child instanceof THREE.Mesh) {
                child.material = highlightMaterial
            }
        });
        this.world.add(highlightObject)
    }

    clearhighlightMeshes(){
        if(this.world){
            this.world.clear();
        }
        this.highlightName = [];
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

export default HighlightUtils;
