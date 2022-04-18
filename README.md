## AgLayer框架

## Version
#### AgLayer: v1.0.0
#### village: v1.0.12(mapbox: v2.6.1)
#### threejs: 0.129.0


## API

### 1、agLayer.analysis
### 空间分析功能
```
1.1 agLayer.analysis.CutFillAnalysis (填挖方分析)
1.2 agLayer.analysis.FireAnalysis (火灾分析)
1.3 agLayer.analysis.FloodAnalysis (水淹分析)
1.4 agLayer.analysis.ViewShedAnalysis (可视域分析)
```

### 2、agLayer.draw
### 绘制功能
```
2.1 agLayer.draw.threejsDrawUtils (threejs中绘制点线面等)
```

### 3、agLayer.effect
### 特效功能
```
3.1 agLayer.effect.ClassificationPrimitive (单体化)
3.1 agLayer.effect.FireEffectUtils (火焰特效)
3.1 agLayer.effect.ThreejsRadarMesh (雷达特效)
3.1 agLayer.effect.ThreejsWater (水面特效)
```

### 4、agLayer.layerManage
### 图层管理
```
4.1 agLayer.layerManage.add3DTiles (添加3dtiles)
4.2 agLayer.layerManage.addBim3DTiles (添加bim模型的3dtiles)
4.3 agLayer.layerManage.addObjectByMercator (通过墨卡托坐标添加模型)
4.4 agLayer.layerManage.addObjectByThreeLocal (通过threejs局部坐标添加模型)
4.5 agLayer.layerManage.addObjectByWgs84 (通过wgs84经纬度坐标添加模型)
4.6 agLayer.layerManage.addWMSLayers (添加wms服务)
4.7 agLayer.layerManage.get3DTilesLayerById (通过layerId获取3dtiles图层)
4.8 agLayer.layerManage.get3DTilesLayerByMesh (通过mesh获取3dtiles图层)
4.9 agLayer.layerManage.getObjectLayerByLayerId (通过layerId获取object图层)
4.10 agLayer.layerManage.moveLayerBefordThreejs (移动图层顺序到threejs场景前面)
4.11 agLayer.layerManage.remove3DTile (移除3dtils)
4.12 agLayer.layerManage.remove3DTiles (移除多个3dtils)
4.13 agLayer.layerManage.removeMapboxLayers (移除mapbox的图层)
4.14 agLayer.layerManage.removeObjecLayerById (移除object图层)
4.15 agLayer.layerManage.removeObjecLayerByIds (移除多个object图层)
4.16 agLayer.layerManage.removeObjectById (移除object图层内的object)
4.17 agLayer.layerManage.tilesetLayerLoad (3dtiles图层加载完成之后回调)
```

### 5、agLayer.manage
### 场景管理
```
5.1 agLayer.manage.addRenderBeforeEvent (添加渲染前事件)
5.2 agLayer.manage.removeRenderBoforeEvent (移除渲染前事件)
5.3 agLayer.manage.updateSceneState (场景强制更新)
```

### 6、agLayer.utils
### 工具模块
```
6.1 agLayer.utils.coorTransformUtils (坐标转换工具)
6.1 agLayer.utils.highlightUtils (高亮工具)
6.1 agLayer.utils.measureUtils (测量工具)
```

## License

Copyright © 2022 Augurit
