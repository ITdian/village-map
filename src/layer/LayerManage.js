/**
 * 图层加载类
 */


import AgLayerEnum from "../enum/AgLayerEnum";
import {Mapbox3DTiles} from "./Mapbox3DTiles";
import ThreejsObjectLayer from "./ThreejsObjectLayer";
import ResourceTracker from "../utils/resourceTracker";
// 定义resMgr和track用来清理three
let resMgr = new ResourceTracker();
const track = resMgr.track.bind(resMgr);

class LayerManage {
    constructor(map, threejsProperty) {
        this.map = map;
        this.threejsProperty = threejsProperty;
        this.enum = new AgLayerEnum();

        this.tileLayerIds = {};
        this.objectLayerIds = {};
        this.defaultObjectLayerId = "defaultObjectLayerId";
    }

    /**
     * 新增3DTiles
     * @param data
     * {
     *      url: tileset.json路径,
     *      id: 图层id,
     *      position: {lng: lng, lat: lat, height: height},
     *      scale: 模型缩放
     *      maximumScreenSpaceError: 用于驱动细节细化级别的最大屏幕空间误差(default: 16),
     *      maximumMemoryUsage: 最大使用内存/MB(default: 512),
     *      landId: 地块id,
     *      useTerrainHeight: false       是否使用地形的高度
     *      tileType: tileTypeEnum
     * }
     * @return {Mapbox3DTilesLayer}
     */
    add3DTiles(data){
        if (!data) {
            console.error("参数不能为空");
            return;
        }
        if (!data.id) {
            console.error("id不能为空");
            return;
        }
        if(this.tileLayerIds[data.id]){
            console.error("已经存在3dtiles图层：" + data.id);
            return;
        }
        if (!data.url) {
            console.error("url不能为空");
            return;
        }
        if(!data.tileType){
            data.tileType = this.enum.tileTypeEnum.default;
        }

        let position = data.position;
        if(position){
            position.height = position.height ? position.height : 0;
        }
        let tilesetLayer = new Mapbox3DTiles.Mapbox3DTilesLayer(data, this.threejsProperty);
        this.map.addLayer(tilesetLayer)
        this.tileLayerIds[data.id] = tilesetLayer;

        //移动初始化图层到最后面
        this.map.moveLayer(data.id, this.enum.defaultLayerEnum.initThreejsLayer);

        return tilesetLayer
    }
    addBim3DTiles(data){
        data.tileType = this.enum.tileTypeEnum.bim;
        return this.add3DTiles(data);
    }

    // 异步等待tilesetLayer加载完毕
    async tilesetLayerLoad(tilesetLayer){
        return new Promise(function (resolve){
            getProperty();
            function getProperty(){
                if(!(tilesetLayer.tileset.root)){
                    setTimeout(function (){
                        getProperty()
                    },1000)
                }else{
                    resolve()
                }
            }
        })
    }
    //通过mesh获取所属的图层
    get3DTilesLayerByMesh(meshObject){
        let layerId = null;
        if(meshObject){
            recursion(meshObject);
        }
        if(layerId){
            return this.get3DTilesLayerById(layerId);
        }

        function recursion(_object){
            if(_object && _object.userData && _object.userData.tileType){
                let rootObject = _object;
                if(rootObject.parent){
                    let parent = rootObject.parent;
                    layerId = parent.name;
                }
            }else if(_object.parent){
                recursion(_object.parent);
            }
        }
    }

    /**
     * 通过图层id获取3dtiles图层
     * @param layerId
     * @returns {*|any}
     */
    get3DTilesLayerById(layerId){
        if(layerId && this.tileLayerIds[layerId]){
            return this.tileLayerIds[layerId];
        }
    }
    // 移除单个3DTiles
    remove3DTile(id) {
        if (this.map.getLayer(id)) {
            this.map.removeLayer(id)
        }
        let worldUuid = null

        this.threejsProperty.tilesetLayers = this.threejsProperty.tilesetLayers.filter((item) => {
            if (item.id != id) {
                return item
            } else {
                worldUuid = item.world.uuid
                this.threejsProperty.scene.remove(item.world)
            }
        })

        this.threejsProperty.worlds = this.threejsProperty.worlds.filter((item) => {
            if (item.uuid != worldUuid) {
                return item
            } else {
                track(item)
                resMgr && resMgr.dispose()
            }
        })
        if(this.tileLayerIds[id]){
            delete this.tileLayerIds[id];
        }
    }
    // 移除多个3DTiles
    remove3DTiles(ids) {
        for (let i = 0; i < ids.length; i++) {
            this.remove3DTile(ids[i])
        }
    }


    /**
     * 获取objectLayer（没有则新建）
     * @param layerId
     * @returns {null}
     */
    getObjectLayerByLayerId(layerId){
        let layer;
        if(this.objectLayerIds[layerId]){
            layer = this.objectLayerIds[layerId];
        }else{
            layer = new ThreejsObjectLayer(layerId, this.threejsProperty);
            this.objectLayerIds[layerId] = layer;
        }
        return layer;
    }
    /**
     * 添加Object到图层中(wgs84)
     * @param object 模型object
     * @param id object的id
     * @param position {lng: xxx, lat: xxx, height: xxx}
     * @param option 配置： {noCastShadow: 不添加阴影(default: true), useTerrainHeight: 使用地形高度(default: true)}
     * @param layerId 图层id（没有图层则新增）
     */
    addObjectByWgs84(object, id, position, option, layerId = this.defaultObjectLayerId){
        let layer = this.getObjectLayerByLayerId(layerId);
        layer.addObjectByLngLat(object, id, position.lng, position.lat, position.height, option.noCastShadow, option.useTerrainHeight);
    }
    /**
     * 添加Object到图层中(墨卡托)
     * @param object 模型object
     * @param id object的id
     * @param position {x: xxx, y: xxx, z: xxx}
     * @param option 配置： {noCastShadow: 不添加阴影(default: true), useTerrainHeight: 使用地形高度(default: true)}
     * @param layerId 图层id（没有图层则新增）
     */
    addObjectByMercator(object, id, position, option, layerId = this.defaultObjectLayerId){
        let layer = this.getObjectLayerByLayerId(layerId);
        layer.addObjectByMercator(object, id, position.x, position.y, position.z, option.noCastShadow, option.useTerrainHeight);
    }
    /**
     * 添加Object到图层中(墨卡托)
     * @param object 模型object
     * @param id object的id
     * @param position {x: xxx, y: xxx, z: xxx}
     * @param option 配置： {noCastShadow: 不添加阴影(default: true), useTerrainHeight: 使用地形高度(default: true)}
     * @param layerId 图层id（没有图层则新增）
     */
    addObjectByThreeLocal(object, id, position, option, layerId = this.defaultObjectLayerId){
        let layer = this.getObjectLayerByLayerId(layerId);
        layer.addObjectByThreeLocal(object, id, position.x, position.y, position.z, option.noCastShadow, option.useTerrainHeight);
    }

    /**
     * 通过objectid移除object
     * @param objectId
     * @param layerId
     */
    removeObjectById(objectId, layerId = this.defaultObjectLayerId){
        let layer = this.getObjectLayerByLayerId(layerId);
        layer.removeObjectById(objectId);
    }

    removeObjecLayerById(layerId){
        if(this.objectLayerIds[layerId]){
            this.objectLayerIds[layerId].destroy();
            delete this.objectLayerIds[layerId];
        }
    }
    removeObjecLayerByIds(layerIds){
        for (let i = 0; i < layerIds.length; i++) {
            this.removeObjecLayerById(layerIds[i])
        }
    }


    /**
     *
     * @param id
     */
    moveLayerBefordThreejs(id){
        this.map.moveLayer(id, this.enum.defaultLayerEnum.initThreejsLayer)
    }

    /**
     * 加载wms图层
     * @param id 图层id
     * @param wmsOptions
     * {
     *      layerUrl: 图层服务地址，如：http://106.53.221.204:8180/geoserver/bimplatform/wms,
     *      layerName: 图层名称，如：workspaceOfShp:town_jiangsu,
     *      width: 地图输出的宽度 (default: 256),
     *      height: 地图输出的高度 (default: 256),
     *      format: 地图输出的格式 (default: image/png),
     *      transparent: 地图背景是否透明 (default: true),
     *      crs: 地图背景是否透明 (default: EPSG:3857),
     *      minZoom: 图层最小级别 (default: 0),
     *      maxZoom: 图层最大级别 (default: 22),
     * }
     * @param tilesUrl 图层服务地址，如：http://106.53.221.204:8180/geoserver/bimplatform/wms
     * @param {*} sldBody 自定义使用sldBody样式，使用geoserverUtils.getStyleByWorkspacesAndStyleName, analysisStylesXml, createStyleXml生成样式
     * @param {*} beforeId 置于该图层顶部
     */
    addWMSLayers(id, options = {}, sldBody, beforeId = this.enum.defaultLayerEnum.initThreejsLayer) {
        //wmsOptions参数解析
        let layerUrl = options.layerUrl;
        let layerName = options.layerName;
        let width = options.width || 256;
        let height = options.height || 256;
        let format = options.format || "image/png";
        let transparent = options.transparent != null ? options.transparent : true;
        let crs = options.crs || "EPSG:3857";
        let bbox = "bbox-epsg-3857";
        if(crs.split(":").length > 1){
            bbox = `bbox-epsg-` + crs.split(":")[1].trim();
        }

        //sourceOptions参数解析
        let minZoom = options.minZoom || 0;
        let maxZoom = options.maxZoom || this.map.getMaxZoom();

        let sourceUrl = `${layerUrl}?service=WMS&version=1.1.0&request=GetMap&layers=${layerName}&bbox={${bbox}}&width=${width}&height=${height}&srs=${crs}&format=${format}&TRANSPARENT=${transparent}`;
        if(sldBody){
            sourceUrl += "&sld_body=" + encodeURIComponent(sldBody);
        }
        this.map.addSource(id, {
            type: 'raster',
            tiles: [
                sourceUrl,
            ],
            tileSize: 256,
            minzoom: minZoom,
            maxzoom: maxZoom,
            crs: crs
        })
        this.map.addLayer({
            id: id,
            type: 'raster',
            source: id,
            paint: {},
            minzoom: minZoom,
            maxzoom: maxZoom,
        })
        this.map.moveLayer(id, beforeId)
    }

    /**
     * 移除图层
     * @param {string} layerId
     */
    removeMapboxLayers(layerId) {
        // 销毁layers
        if (this.map.getLayer(layerId)) {
            this.map.removeLayer(layerId)
        }
        // 销毁sources
        if (this.map.getSource(layerId)) {
            this.map.removeSource(layerId)
        }
    }


    /**
     * 销毁
     */
    dispose(){
        //销毁3DTiles
        if(this.tileLayerIds){
            let ids = []
            for (let layerId in this.tileLayerIds) {
                ids.push(layerId);
            }
            this.remove3DTiles(ids)
        }

        //销毁object图层
        if(this.objectLayerIds){
            let ids = []
            for (let layerId in this.objectLayerIds) {
                ids.push(layerId);
            }
            this.removeObjecLayerByIds(ids)
        }

    }

}

export default LayerManage;
