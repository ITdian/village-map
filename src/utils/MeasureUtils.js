/**
 * 测量工具类
 */
import mapboxgl from 'village-map';
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import * as turf from '@turf/turf';

import '../assets/styles/mapbox-popup.scss';
//绘制图形的样式
let drawStyles = [
    {
        'id': 'gl-draw-polygon-fill-inactive',
        'type': 'fill',
        'filter': ['all',
            ['==', 'active', 'false'],
            ['==', '$type', 'Polygon'],
            ['!=', 'mode', 'static']
        ],
        'paint': {
            'fill-color': '#3bb2d0',
            'fill-outline-color': '#3bb2d0',
            'fill-opacity': 0.3
        }
    },
    {
        'id': 'gl-draw-polygon-fill-active',
        'type': 'fill',
        'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
        'paint': {
            'fill-color': '#56fb2d',
            'fill-outline-color': '#56fb2d',
            'fill-opacity': 0.3
        }
    },
    {
        'id': 'gl-draw-polygon-midpoint',
        'type': 'circle',
        'filter': ['all',
            ['==', '$type', 'Point'],
            ['==', 'meta', 'midpoint']],
        'paint': {
            'circle-radius': 4,
            'circle-color': '#56fb2d'
        }
    },
    {
        'id': 'gl-draw-polygon-stroke-inactive',
        'type': 'line',
        'filter': ['all',
            ['==', 'active', 'false'],
            ['==', '$type', 'Polygon'],
            ['!=', 'mode', 'static']
        ],
        'layout': {
            'line-cap': 'round',
            'line-join': 'round'
        },
        'paint': {
            'line-color': '#3bb2d0',
            'line-width': 3
        }
    },
    {
        'id': 'gl-draw-polygon-stroke-active',
        'type': 'line',
        'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
        'layout': {
            'line-cap': 'round',
            'line-join': 'round'
        },
        'paint': {
            'line-color': '#56fb2d',
            'line-dasharray': [0.2, 2],
            'line-width': 3
        }
    },
    {
        'id': 'gl-draw-line-inactive',
        'type': 'line',
        'filter': ['all',
            ['==', 'active', 'false'],
            ['==', '$type', 'LineString'],
            ['!=', 'mode', 'static']
        ],
        'layout': {
            'line-cap': 'round',
            'line-join': 'round'
        },
        'paint': {
            'line-color': '#3bb2d0',
            'line-width': 3
        }
    },
    {
        'id': 'gl-draw-line-active',
        'type': 'line',
        'filter': ['all',
            ['==', '$type', 'LineString'],
            ['==', 'active', 'true']
        ],
        'layout': {
            'line-cap': 'round',
            'line-join': 'round'
        },
        'paint': {
            'line-color': '#56fb2d',
            'line-dasharray': [0.2, 2],
            'line-width': 3
        }
    },
    {
        'id': 'gl-draw-polygon-and-line-vertex-stroke-inactive',
        'type': 'circle',
        'filter': ['all',
            ['==', 'meta', 'vertex'],
            ['==', '$type', 'Point'],
            ['!=', 'mode', 'static']
        ],
        'paint': {
            'circle-radius': 5,
            'circle-color': '#fff'
        }
    },
    {
        'id': 'gl-draw-polygon-and-line-vertex-inactive',
        'type': 'circle',
        'filter': ['all',
            ['==', 'meta', 'vertex'],
            ['==', '$type', 'Point'],
            ['!=', 'mode', 'static']
        ],
        'paint': {
            'circle-radius': 4,
            'circle-color': '#56fb2d'
        }
    },
    {
        'id': 'gl-draw-point-point-stroke-inactive',
        'type': 'circle',
        'filter': ['all',
            ['==', 'active', 'false'],
            ['==', '$type', 'Point'],
            ['==', 'meta', 'feature'],
            ['!=', 'mode', 'static']
        ],
        'paint': {
            'circle-radius': 5,
            'circle-opacity': 1,
            'circle-color': '#fff'
        }
    },
    {
        'id': 'gl-draw-point-inactive',
        'type': 'circle',
        'filter': ['all',
            ['==', 'active', 'false'],
            ['==', '$type', 'Point'],
            ['==', 'meta', 'feature'],
            ['!=', 'mode', 'static']
        ],
        'paint': {
            'circle-radius': 4,
            'circle-color': '#3bb2d0'
        }
    },
    {
        'id': 'gl-draw-point-stroke-active',
        'type': 'circle',
        'filter': ['all',
            ['==', '$type', 'Point'],
            ['==', 'active', 'true'],
            ['!=', 'meta', 'midpoint']
        ],
        'paint': {
            'circle-radius': 7,
            'circle-color': '#fff'
        }
    },
    {
        'id': 'gl-draw-point-active',
        'type': 'circle',
        'filter': ['all',
            ['==', '$type', 'Point'],
            ['!=', 'meta', 'midpoint'],
            ['==', 'active', 'true']],
        'paint': {
            'circle-radius': 5,
            'circle-color': '#56fb2d'
        }
    },
    {
        'id': 'gl-draw-polygon-fill-static',
        'type': 'fill',
        'filter': ['all', ['==', 'mode', 'static'], ['==', '$type', 'Polygon']],
        'paint': {
            'fill-color': '#404040',
            'fill-outline-color': '#404040',
            'fill-opacity': 0.3
        }
    },
    {
        'id': 'gl-draw-polygon-stroke-static',
        'type': 'line',
        'filter': ['all', ['==', 'mode', 'static'], ['==', '$type', 'Polygon']],
        'layout': {
            'line-cap': 'round',
            'line-join': 'round'
        },
        'paint': {
            'line-color': '#404040',
            'line-width': 3
        }
    },
    {
        'id': 'gl-draw-line-static',
        'type': 'line',
        'filter': ['all', ['==', 'mode', 'static'], ['==', '$type', 'LineString']],
        'layout': {
            'line-cap': 'round',
            'line-join': 'round'
        },
        'paint': {
            'line-color': '#404040',
            'line-width': 3
        }
    },
    {
        'id': 'gl-draw-point-static',
        'type': 'circle',
        'filter': ['all', ['==', 'mode', 'static'], ['==', '$type', 'Point']],
        'paint': {
            'circle-radius': 5,
            'circle-color': '#404040'
        }
    }
];

var _this;
class MeasureUtils{
    constructor(map) {
        _this = this;
        _this.map = map;
        //绘制点
        _this.popupPosition = null;

        //测量距离
        _this.popupDistance = null;
        _this.drawDistance = null;

        //测量面积
        _this.popupArea = null;
        _this.drawArea = null;

        //测量面积
        _this.popupVolume = null;
        _this.drawVolume= null;
        _this.volumeArea = 0;
        _this.volumeHeight = 10;
        _this.volumeSourceId = null;
        _this.volumeLayerId = null;
    }

    /**
     * 获取位置信息
     * @param map
     */
    addGetPositionHandle(){
        if(!_this.map){
            console.error("map不能为空");
            return
        }
        _this.removeGetPostionHandle();
        _this._removePopupPosition();
        _this.map.on('click', this._getPositionEvent)
    }

    /**
     * 移除获取位置信息
     */
    removeGetPostionHandle(){
        if(!this.map){
            console.error("map不能为空");
            return
        }
        _this.map.off('click', this._getPositionEvent);
    }
    _removePopupPosition(){
        if(this.popupPosition){
            this.popupPosition.off('close', this._popupPositionEvent);
            this.popupPosition.remove();
            this.popupPosition = null;
        }
    }
    _popupPositionEvent(e){
        _this._removePopupPosition();
        _this.removeGetPostionHandle();
    }
    /**
     * 位置信息点击事件
     * @param e
     * @private
     */
    _getPositionEvent(e){
        let lngLat = e.lngLat;
        let elevation = _this.map.queryTerrainElevation(lngLat, { exaggerated: false });
        // 移除旧的popup
        _this._removePopupPosition();
        // 显示popup
        if(!_this.popupPosition){
            let popup = new mapboxgl.Popup({ closeOnClick: false, className: 'popup-position' }).addTo(_this.map);
            _this.popupPosition = popup;
            _this.popupPosition.on('close', _this._popupPositionEvent);
        }
        _this.popupPosition.setLngLat([lngLat.lng, lngLat.lat])
            .setHTML(`
                <div class="row" style="display: flex"><label>经度: </label><div class="text">${lngLat.lng.toFixed(6)}</div></div>
                <div class="row" style="display: flex"><label>纬度: </label><div class="text">${lngLat.lat.toFixed(6)}</div></div>
                <div class="row" style="display: flex"><label>高度: </label><div class="text">${elevation ? elevation.toFixed(3) : 0}</div></div>
            `)
        // 移除event
        _this.removeGetPostionHandle();
    }

    /**
     * 获取距离信息
     * @param map
     */
    addGetDistanceHandle(){
        if(!_this.map){
            console.error("map不能为空");
            return
        }
        _this.removeGetDistanceHandle();
        _this._removePopupDistance();
        var draw = new MapboxDraw({
            displayControlsDefault: false,
            // Select which mapbox-gl-draw control buttons to add to the map.
            controls: {
                polygon: true,
                trash: true
            },
            // Set mapbox-gl-draw to draw by default.
            // The user does not have to click the polygon control button first.
            defaultMode: 'draw_line_string',
            styles: drawStyles
        });
        _this.drawDistance = draw;
        _this.map.addControl(draw);

        _this.map.on('draw.create', _this._getDistanceEvent);
        _this.map.on('draw.delete', _this._getDistanceEvent);
        _this.map.on('draw.update', _this._getDistanceEvent);

    }
    /**
     * 移除获取距离信息
     */
    removeGetDistanceHandle(){
        if(!_this.map){
            console.error("map不能为空");
            return
        }
        // 移除绘制的图形
        if(_this.map && this.drawDistance){
            _this.map.removeControl(this.drawDistance);
            _this.drawDistance = null;

            _this.map.off('draw.create', _this._getDistanceEvent);
            _this.map.off('draw.delete', _this._getDistanceEvent);
            _this.map.off('draw.update', _this._getDistanceEvent);
        }
    }
    _removePopupDistance(){
        if(_this.popupDistance){
            _this.popupDistance.off('close', _this._popupDistanceEvent);
            _this.popupDistance.remove();
            _this.popupDistance = null;
        }
    }
    _popupDistanceEvent(e){
        _this.removeGetDistanceHandle();
        _this._removePopupDistance();
    }
    _getDistanceEvent(e){
        if(_this.drawDistance){
            var data = _this.drawDistance.getAll();
            if (data.features.length > 0) {
                let distance = turf.length(data, {units: 'meters'});   //单位m
                let unit = "m";
                if(distance > 10 * 1000){    //大于10平方公里
                    unit = "km";
                    distance = distance / 1000;
                }
                var rounded_distance = Math.round(distance * 100) / 100;
                console.log("距离", distance + unit);
                // 移除旧的popup
                _this._removePopupDistance();
                // 显示popup
                if(!_this.popupDistance){
                    let popup = new mapboxgl.Popup({ closeOnClick: false, className: 'popup-distance' }).addTo(_this.map);
                    _this.popupDistance = popup;
                    _this.popupDistance.on('close', _this._popupDistanceEvent);
                }
                let geoCoors = data.features[0].geometry.coordinates;
                _this.popupDistance.setLngLat([geoCoors[geoCoors.length - 1][0], geoCoors[geoCoors.length - 1][1]])
                    .setHTML(`<div class="row" style="display: flex"><label>距离: </label><div class="text">${rounded_distance} ${unit}</div></div>`)
            }
        }
    }

    /**
     * 获取面积信息
     * @param map
     */
    addGetAreaHandle(){
        if(!_this.map){
            console.error("map不能为空");
            return
        }
        _this.removeGetAreaHandle();
        _this._removePopupArea();
        var draw = new MapboxDraw({
            displayControlsDefault: false,
            // Select which mapbox-gl-draw control buttons to add to the map.
            controls: {
                polygon: true,
                trash: true
            },
            // Set mapbox-gl-draw to draw by default.
            // The user does not have to click the polygon control button first.
            defaultMode: 'draw_polygon',
            styles: drawStyles
        });
        _this.drawArea = draw;
        _this.map.addControl(draw);

        _this.map.on('draw.create', this._getAreaEvent);
        _this.map.on('draw.delete', this._getAreaEvent);
        _this.map.on('draw.update', this._getAreaEvent);

    }
    /**
     * 移除获取面积信息
     */
    removeGetAreaHandle(){
        if(!_this.map){
            console.error("map不能为空");
            return
        }
        // 移除绘制的图形
        if(_this.map && this.drawArea){
            _this.map.removeControl(this.drawArea);
            _this.drawArea = null;

            _this.map.off('draw.create', this._getAreaEvent);
            _this.map.off('draw.delete', this._getAreaEvent);
            _this.map.off('draw.update', this._getAreaEvent);
        }
    }
    _removePopupArea(){
        if(_this.popupArea){
            _this.popupArea.off('close', this._popupAreaEvent);
            _this.popupArea.remove();
            _this.popupArea = null;
        }
    }
    _popupAreaEvent(e){
        _this.removeGetAreaHandle();
        _this._removePopupArea();
    }
    _getAreaEvent(e){
        if(_this.drawArea){
            var data = _this.drawArea.getAll();
            if (data.features.length > 0) {
                let area = turf.area(data);
                let unit = "㎡";
                if(area > 10 * 1000 * 1000){    //大于10平方公里
                    unit = "k㎡";
                    area = area / (1000 * 1000);
                }
                var rounded_area = Math.round(area * 100) / 100;
                console.log("面积", rounded_area + unit);
                // 移除旧的popup
                _this._removePopupArea();
                // 显示popup
                if(!_this.popupArea){
                    let popup = new mapboxgl.Popup({ closeOnClick: false, className: 'popup-area' }).addTo(_this.map);
                    _this.popupArea = popup;
                    _this.popupArea.on('close', _this._popupAreaEvent);
                }
                let geoCoors = data.features[0].geometry.coordinates[0];
                _this.popupArea.setLngLat([geoCoors[geoCoors.length - 2][0], geoCoors[geoCoors.length - 2][1]])
                    .setHTML(`<div class="row" style="display: flex"><label>面积: </label><div class="text">${rounded_area} ${unit}</div></div>`)
            }
        }
    }

    /**
     * 获取体积信息
     * @param map
     */
    addGetVolumeHandle(){
        if(!_this.map){
            console.error("map不能为空");
            return
        }
        _this.removeGetVolumeHandle();
        _this._removePopupVolume();
        _this._removeVolumeLayer();
        var draw = new MapboxDraw({
            displayControlsDefault: false,
            // Select which mapbox-gl-draw control buttons to add to the map.
            controls: {
                polygon: true,
                trash: true
            },
            // Set mapbox-gl-draw to draw by default.
            // The user does not have to click the polygon control button first.
            defaultMode: 'draw_polygon',
            styles: drawStyles
        });
        _this.drawVolume = draw;
        _this.map.addControl(draw);

        _this.map.on('draw.create', this._getVolumeEvent);
        _this.map.on('draw.delete', this._getVolumeEvent);
        _this.map.on('draw.update', this._getVolumeEvent);

    }
    /**
     * 移除获取面积信息
     */
    removeGetVolumeHandle(){
        if(!_this.map){
            console.error("map不能为空");
            return
        }
        // 移除绘制的图形
        if(_this.map && this.drawVolume){
            _this.map.removeControl(this.drawVolume);
            _this.drawVolume = null;

            _this.map.off('draw.create', this._getVolumeEvent);
            _this.map.off('draw.delete', this._getVolumeEvent);
            _this.map.off('draw.update', this._getVolumeEvent);
        }
    }
    _removePopupVolume(){
        if(_this.popupVolume){
            _this.popupVolume.off('close', this._popupVolumeEvent);
            _this.popupVolume.remove();
            _this.popupVolume = null;
        }
    }
    _popupVolumeEvent(e){
        _this.removeGetVolumeHandle();
        _this._removePopupVolume();
        _this._removeVolumeLayer();
    }
    _getVolumeEvent(e){
        if(_this.drawVolume){
            var data = _this.drawVolume.getAll();
            _this._setPopupVolumeHtml(data);
        }
    }
    _editVolumeLayer(geojson){
        if(!_this.volumeLayerId){
            _this.volumeLayerId = "measureVolumeLayer" + new Date().getTime();
            _this.volumeSourceId = "measureVolumeSource" + new Date().getTime();
        }
        //处理source
        if(!_this.map.getSource(_this.volumeSourceId)){
            _this.map.addSource(_this.volumeSourceId, {
                type: 'geojson',
                data: geojson
            })
        }else{
            _this.map.getSource(_this.volumeSourceId).setData(geojson)
        }
        //处理layer
        if(!_this.map.getLayer(_this.volumeLayerId)){
            _this.map.addLayer({
                id: _this.volumeLayerId,
                source: _this.volumeSourceId,
                'type': 'fill-extrusion',
                'paint': {
                    'fill-extrusion-color': '#56fb2d',
                    'fill-extrusion-height': 10,
                    'fill-extrusion-base': 0,
                    'fill-extrusion-opacity': 0.7,
                    //渐变色设置
                    // 'fill-extrusion-custom-gradient': true,
                    // 'fill-extrusion-custom-gradient-color': '#AAFFAA',
                    // 'fill-extrusion-custom-gradient-intensity': 0.4,
                    // 'fill-extrusion-custom-gradient-bottom-intensity': 0.7,
                }
            })
        }else{
            _this.map.setPaintProperty(_this.volumeLayerId, 'fill-extrusion-height', 10);
        }
    }
    _editVolumeLayerHeigth(height){
        if(_this.map.getLayer(_this.volumeLayerId)){
            _this.map.setPaintProperty(_this.volumeLayerId, 'fill-extrusion-height', height);
        }
        _this._setPopupVolumeHtml();
    }
    _setPopupVolumeHtml(geojson){
        if(geojson && geojson.features.length > 0){
            //添加白模图层
            _this._editVolumeLayer(geojson);

            //计算面积、体积
            let area = turf.area(geojson);
            _this.volumeArea = area;
            // 移除旧的popup
            _this._removePopupArea();
            // 显示popup
            if(!_this.popupVolume){
                let popup = new mapboxgl.Popup({ closeOnClick: false, className: 'popup-volume', maxWidth: '32rem' }).addTo(_this.map);
                _this.popupVolume = popup;
                _this.popupVolume.on('close', _this._popupVolumeEvent);
            }
            let geoCoors = geojson.features[0].geometry.coordinates[0];
            _this.popupVolume.setLngLat([geoCoors[geoCoors.length - 2][0], geoCoors[geoCoors.length - 2][1]]);
        }

        //计算面积、体积
        let area = _this.volumeArea;
        let unit = "㎡";
        let rounded_area = area;
        if(rounded_area > 10 * 1000 * 1000){    //大于10平方公里
            unit = "k㎡";
            rounded_area = rounded_area / (1000 * 1000);
        }
        rounded_area = Math.round(rounded_area * 100) / 100;
        console.log("面积", rounded_area + unit);
        //计算体积
        let volume = area * _this.volumeHeight;
        let volumeUnit = "m³";
        if(volume > 1 * 1000 * 1000 * 1000){    //大于1立方公里
            volumeUnit = "km³";
            volume = volume / (1000 * 1000 * 1000);
        }
        volume = Math.round(volume * 100) / 100;
        console.log("体积", volume + volumeUnit);
        _this.popupVolume.setHTML(`<div class="row" style="display: flex"><label>面积: </label><div class="text">${rounded_area} ${unit}</div></div>
                        <div class="row" style="display: flex"><label>高度: </label><div class="text"><input id="measureVolumeInput" class="height-input" type="number" value="${_this.volumeHeight}"/> m</div></div>
                        <div class="row" style="display: flex"><label>体积: </label><div class="text">${volume} ${volumeUnit}</div></div>`);
        //添加事件监听
        document.getElementById("measureVolumeInput").onchange=function(e){
            let value = parseFloat(this.value);
            if(isNaN(value) || value < 0){
                value = 0;
            }
            _this.volumeHeight = value;
            _this._editVolumeLayerHeigth(value);
        }
    }
    _removeVolumeLayer(){
        if(_this.map.getLayer(_this.volumeLayerId)){
            _this.map.removeLayer(_this.volumeLayerId);
        }
        if(_this.map.getSource(_this.volumeSourceId)){
            _this.map.removeSource(_this.volumeSourceId);
        }
        _this.volumeLayerId = null;
        _this.volumeSourceId = null;
    }
}
export default MeasureUtils;
