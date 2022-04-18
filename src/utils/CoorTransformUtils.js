import * as THREE from "three";
import mapboxgl from "village-map";
import threejsProperty from "../manage/threejsProperty";

/**
 * 角度转弧度
 * @param r
 * @returns {number}
 */
const radToangle = function (r) {
    let a = r * 180.0 / Math.PI
    return a
}
/**
 * 坐标转换
 */

class CoorTransformUtils {
    constructor() {
        this.threejsProperty = threejsProperty;
    }

    /**
     * 笛卡尔坐标系转经纬度
     * @param x
     * @param y
     * @param z
     * @returns {{lng, lat, height}}
     */
    descartesToWgs84(x, y, z){
        let longRadius = 6378137.0 // 参考椭球的长半轴, 单位 m
        let shortRadius = 6356752.31414 // 参考椭球的短半轴, 单位 m
        let lng, lat, h
        let e = Math.sqrt((longRadius * longRadius - shortRadius * shortRadius) / (longRadius * longRadius))

        if (x == 0 && y > 0) {
            lng = 90
        } else if (x == 0 && y < 0) {
            lng = -90
        } else if (x < 0 && y >= 0) {
            lng = Math.atan(y / x)
            lng = radToangle(lng)
            lng = lng + 180
        } else if (x < 0 && y >= 0) {
            lng = Math.atan(y / x)
            lng = radToangle(lng)
            lng = lng - 180
        } else {
            lng = Math.atan(y / x)
            lng = radToangle(lng)
        }

        let b0 = Math.atan(z / Math.sqrt(x * x + y * y))
        let N_temp = longRadius / Math.sqrt((1 - e * e * Math.sin(b0) * Math.sin(b0)))
        let b1 = Math.atan((z + N_temp * e * e * Math.sin(b0)) / Math.sqrt(x * x + y * y))

        while (Math.abs(b0 - b1) > 1e-7) {
            b0 = b1
            N_temp = longRadius / Math.sqrt((1 - e * e * Math.sin(b0) * Math.sin(b0)))
            b1 = Math.atan((z + N_temp * e * e * Math.sin(b0)) / Math.sqrt(x * x + y * y))
        }
        lat = b1
        let N = longRadius / Math.sqrt((1 - e * e * Math.sin(lat) * Math.sin(lat)))
        h = Math.sqrt(x * x + y * y) / Math.cos(lat) - N
        lat = radToangle(lat)
        return {
            'lng': lng,
            'lat': lat,
            'height': h
        }
    }
    /**
     * 经纬度 to 墨卡托
     * @param lng
     * @param lat
     * @param height
     * @returns {{x: number, y: number, z: number}}
     */
    wgs84ToMercator(lng, lat, height = 0){
        let R = 6378137.0;
        let radians = Math.PI / 180
        let x = R * lng * radians;
        let y = R * Math.log(Math.tan((Math.PI * 0.25) + (0.5 * lat * radians)));
        return {
            'x': x,
            'y': y,
            'z': height
        }
    }
    /**
     * 墨卡托 to 经纬度
     * @param x
     * @param y
     * @param z
     * @returns {{lng: number, lat: number, height: number}}
     */
    mercatorToWgs84(x, y, z = 0){
        let R = 6378137.0;
        let lnglat = {
            lng: 0,
            lat: 0,
            height: z,
        };
        let lng = x / (R * Math.PI) * 180;
        let lat = y / (R * Math.PI) * 180;
        lat = 180 / Math.PI * (2 * Math.atan(Math.exp(lat * Math.PI / 180)) - Math.PI / 2);
        lnglat.lng = lng;
        lnglat.lat = lat;
        return lnglat;
    }

    /**
     * threeWorld to threeLocal
     * threejs全局坐标转局部坐标
     * @param position
     * @returns {Vector3}
     */
    threeWorldToLocal(position){
        let world = this.threejsProperty.mercatorWorld;
        if(position && position instanceof THREE.Vector3){
            let originMatrix = new THREE.Matrix4().copy(world.matrix).invert();
            //计算偏移量
            let tranformsMatrix = new THREE.Matrix4().setPosition(position);
            originMatrix.multiply(tranformsMatrix);
            let mercatorVector = new THREE.Vector3().setFromMatrixPosition(originMatrix);
            return mercatorVector;
        }
    }
    /**
     * threeLocal to threeWorld
     * threejs局部坐标转全局坐标
     * @param position
     * @param world
     * @returns {Vector3}
     */
    threeLocalToWorld(position){
        let world = this.threejsProperty.mercatorWorld;
        if(position && position instanceof THREE.Vector3){
            let originMatrix = new THREE.Matrix4().copy(world.matrix);
            //计算偏移量
            let tranformsMatrix = new THREE.Matrix4().setPosition(position);
            originMatrix.multiply(tranformsMatrix);
            let threeCoorVector = new THREE.Vector3().setFromMatrixPosition(originMatrix);
            return threeCoorVector;
        }
    }

    /**
     * 经纬度转threejs全局坐标
     * @param lng
     * @param lat
     * @param height
     * @returns {Vector3}
     */
    wgs84ToThreeWorld(lng, lat, height){
        let localVector = this.wgs84ToThreeLocal(lng, lat, height);
        let pointVector3 = this.threeLocalToWorld(new THREE.Vector3(localVector.x, localVector.y, localVector.z));
        return pointVector3;
    }
    /**
     * threejs全局坐标转经纬度
     * @param worldVector
     * @returns {{lng, lat, height}}
     */
    threeWorldToWgs84(worldVector){
        let localVector = this.threeWorldToLocal(worldVector);
        return this.threeLocalToWgs84(localVector);
    }

    /**
     * 经纬度转threejs局部坐标
     * @param lng
     * @param lat
     * @param height
     * @returns {Vector3}
     */
    wgs84ToThreeLocal(lng, lat, height, worldScale){
        worldScale = worldScale ? worldScale : this.threejsProperty.worldParams.scale;
        let modelOrigin = [lng, lat];
        let modelAltitude = height ? height : 0;

        let modelAsMercatorCoordinate = mapboxgl.MercatorCoordinate.fromLngLat(
            modelOrigin,
            modelAltitude
        );
        return new THREE.Vector3(modelAsMercatorCoordinate.x / worldScale, modelAsMercatorCoordinate.z / worldScale, modelAsMercatorCoordinate.y / worldScale)
    }
    /**
     * threejs局部坐标转经纬度
     * @param localVector
     * @returns {{lng, lat, height}}
     */
    threeLocalToWgs84(localVector, worldScale){
        worldScale = worldScale ? worldScale : this.threejsProperty.worldParams.scale;
        let modelAsMercatorCoordinate = new mapboxgl.MercatorCoordinate(localVector.x * worldScale, localVector.z * worldScale, localVector.y * worldScale);
        let modelLngLat = modelAsMercatorCoordinate.toLngLat();
        let modelAltitude = modelAsMercatorCoordinate.toAltitude();
        return {lng: modelLngLat.lng, lat: modelLngLat.lat, height: modelAltitude};
    }

    /**
     * 墨卡托转threejs全局坐标
     * @param x
     * @param y
     * @param z
     * @returns {Vector3}
     */
    mercatorToThreeWorld(x, y, z = 0){
        let lnglat = this.mercatorToWgs84(x, y, z);
        return this.wgs84ToThreeWorld(lnglat.lng, lnglat.lat, lnglat.height);
    }
    /**
     * threejs全局坐标转墨卡托
     * @param worldVector
     * @returns {{x: number, y: number, z: number}}
     */
    threeWorldToMercator(worldVector){
        let lnglat = this.threeWorldToWgs84(worldVector);
        return this.wgs84ToMercator(lnglat.lng, lnglat.lat, lnglat.height);
    }

    /**
     * 墨卡托转threejs局部坐标
     * @param x
     * @param y
     * @param z
     * @returns {Vector3}
     */
    mercatorToThreeLocal(x, y, z = 0){
        let lnglat = this.mercatorToWgs84(x, y, z);
        return this.wgs84ToThreeLocal(lnglat.lng, lnglat.lat, lnglat.height);
    }
    /**
     * threejs局部坐标转墨卡托
     * @param worldVector
     * @returns {{x: number, y: number, z: number}}
     */
    threeLocalToMercator(worldVector){
        let lnglat = this.threeLocalToWgs84(worldVector);
        return this.wgs84ToMercator(lnglat.lng, lnglat.lat, lnglat.height);
    }

    /**
     * 获取mapbox墨卡托坐标和缩放
     * @param lng
     * @param lat
     * @returns {{x, y, z, scale}}
     */
    wgs84ToMapboxMercator(lng, lat){
        let modelOrigin = [lng, lat];
        let modelAltitude = 0;

        let modelAsMercatorCoordinate = mapboxgl.MercatorCoordinate.fromLngLat(
            modelOrigin,
            modelAltitude
        );
        let scale = modelAsMercatorCoordinate.meterInMercatorCoordinateUnits();
        return {x: modelAsMercatorCoordinate.x, y: modelAsMercatorCoordinate.y, z: modelAsMercatorCoordinate.z, scale: scale};
    }
}

export default CoorTransformUtils;
