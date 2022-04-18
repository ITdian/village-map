/**
 * agLayer入口
 * 初始化以及调用统一使用该入口
 */
import threejsProperty from "./manage/threejsProperty";
import ThreejsManage from "./manage/ThreejsManage";

import AgLayerEnum from "./enum/AgLayerEnum";

import CoorTransformUtils from "./utils/CoorTransformUtils";
import MeasureUtils from "./utils/MeasureUtils";

import LayerManage from "./layer/LayerManage";

import ClassificationPrimitive from "./effect/ClassificationPrimitive";
import {Water} from "./effect/ThreejsWater";
import {RadarMesh} from "./effect/ThreejsRadarMesh";
import FireEffectUtils from "./effect/FireEffectUtils";

import ViewShedAnalysis from "./analysis/ViewShedAnalysis";
import FloodAnalysis from "./analysis/FloodAnalysis";
import FireAnalysis from "./analysis/FireAnalysis";
import CutFillAnalysis from "./analysis/CutFillAnalysis";

import ThreejsDrawUtils from "./draw/ThreejsDrawUtils";
import Stats from "stats.js";

class AgLayer {
    constructor(map) {
        this.map = map;
        this.threejsProperty = threejsProperty;

        //初始化manage模块
        this.manage = new ThreejsManage(this.map, this.threejsProperty);

        //初始化枚举
        this.enum = new AgLayerEnum();

        //初始化utils模块
        this.utils = {
            coorTransformUtils: new CoorTransformUtils(),
            highlightUtils: this.threejsProperty.highlightUtils,
            measureUtils: new MeasureUtils(this.map),
        };

        //初始化layer
        this.layerManage = new LayerManage(this.map, this.threejsProperty);

        //初始化effect模块
        this.effect = {
            ClassificationPrimitive,
            ThreejsWater: Water,
            ThreejsRadarMesh: RadarMesh,
            FireEffectUtils,
        };

        //初始化analysis模块（空间分析）
        this.analysis = {
            ViewShedAnalysis,
            FloodAnalysis,
            FireAnalysis,
            CutFillAnalysis,
        };

        //初始化draw模块
        this.draw = {
            threejsDrawUtils: new ThreejsDrawUtils(this.map),
        };
    }

    /**
     * 显示场景的渲染帧数
     */
    showSceneState() {
        if (this.manage) {
            const stats = new Stats();
            stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
            document.body.appendChild(stats.dom);
            this.manage.addRenderBeforeEvent(() => {
                stats.update();
            });

        }
    }

    /**
     * 销毁
     */
    dispose() {
        // 销毁layers
        const layers = this.map.getStyle().layers;
        for (let index = 0; index < layers.length; index++) {
            const element = layers[index];
            if (this.map.getLayer(element.id)) {
                this.map.removeLayer(element.id);
            }
        }
        // 销毁sources
        const sources = this.map.getStyle().sources;
        const terrainSource = this.map.getTerrain();
        let terrainSourceName = null;
        if (terrainSource) {
            terrainSourceName = terrainSource.source;
        }
        for (const key in sources) {
            if (key == terrainSourceName) {
                continue;
            }
            if (this.map.getSource(key)) {
                this.map.removeSource(key);
            }
        }

        //销毁manage（图层）
        this.layerManage.dispose();
        this.manage.dispose();
    }
}
export default AgLayer;
