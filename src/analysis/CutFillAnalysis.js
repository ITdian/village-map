/**
 * 填挖方分析
 * @author lidy
 * @since 2022-03-16
 * 1、传入分析范围多边形点集（经纬度）
 * 2、插值获取多边形内部的点
 * 3、计算每个点的平均面积、以及高度
 * 4、通过基准高度与高度差，计算得出填挖方的体积（立方米）（耗时较久，需要异步执行）
 * 5、调整mapbox地形的高度（如果有地形的话）
 *
 * 使用方法
 * let cutFillAnalysis = new CutFillAnalysis();
 * cutFillAnalysis.setPolygon({positions: [[lng, lat], [lng, lat], ...]})
 * cutFillAnalysis.setParams({benchmarkHeight: xxx})
 * cutFillAnalysis.startAnalysis();
 */

import * as turf from '@turf/turf';

class CutFillAnalysis {
    constructor(map) {
        this.map = map;

        this.benchmarkHeight = 0;

        this.analysisResult = {
            //填方 面积、体积
            fillArea: 0,
            fillVolume: 0,
            //挖方 面积、体积
            cutArea: 0,
            cutVolume: 0,
        }
        this.polygon = null;
        this.interpolationCount = 100;    //实际为interpolationCount的平方
    }

    /**
     * 开始分析
     */
    async startAnalysis(){
        if(this.polygon && this.polygon.positions && this.polygon.positions.length > 0){
            //生成三角面
            let triangleFeatureCollection = await this.getTriangleInterpolation(this.polygon.positions, this.interpolationCount);
            let benchmarkHeight = this.benchmarkHeight;

            //填方 面积、体积
            let fillArea = 0;
            let fillVolume = 0;
            //挖方 面积、体积
            let cutArea = 0;
            let cutVolume = 0;

            if(triangleFeatureCollection && triangleFeatureCollection.features){
                for(let feature of triangleFeatureCollection.features){
                    // 计算面积、计算高度
                    let heightAndArea = await this.getTriangleHeightAndArea(feature);
                    let triangleHeight = heightAndArea.height;
                    let triangleArea = heightAndArea.area;
                    let triangleVolume = triangleArea * Math.abs(benchmarkHeight - triangleHeight);
                    if(benchmarkHeight >= triangleHeight){   //填方
                        fillArea += triangleArea;
                        fillVolume += triangleVolume;
                    }else{    //挖方
                        cutArea += triangleArea;
                        cutVolume += triangleVolume;
                    }
                }
            }

            this.analysisResult.fillArea = fillArea.toFixed(2);
            this.analysisResult.fillVolume = fillVolume.toFixed(2);
            this.analysisResult.cutArea = cutArea.toFixed(2);
            this.analysisResult.cutVolume = cutVolume.toFixed(2);

            return this.analysisResult;
        }else{
            console.error( "填挖方分析错误： 请先设置参数" );
            return null;
        }
    }

    /**
     * 设置参数
     */
    setParams(params){
        if(params && params.benchmarkHeight){
            this.benchmarkHeight = params.benchmarkHeight;
        }
    }

    /**
     * 设置多边形
     * @param polygon  {positions: [[lng, lat], [lng, lat], ...]}
     */
    setPolygon(polygon){
        this.polygon = polygon;
    }

    /**
     * 异步处理生成三角面
     * @param positions
     * @param interpolationCount
     * @return {Promise<any>}
     */
    async getTriangleInterpolation(positions, interpolationCount){
        let pointFeatureCollection = this.getPointInterpolation(positions, interpolationCount);
        let triangleFeatureCollection = turf.tin(pointFeatureCollection);
        return triangleFeatureCollection;
    }

    /**
     * 处理生成插值点
     * @param positions
     * @param interpolationCount
     * @return {FeatureCollection<Geometry, Properties>}
     */
    getPointInterpolation(positions, interpolationCount){
        let length = this.polygon.positions.length;
        if(positions[0][0] != positions[length - 1][0] || positions[0][1] != positions[length - 1][1]){
            positions.push(positions[0]);
        }
        let polygonFeature = turf.polygon([positions]);
        // 计算box
        let bbox = turf.bbox(polygonFeature);
        // 计算插值间隔
        let width = Math.abs(bbox[0] - bbox[2]);
        let height = Math.abs(bbox[1] - bbox[3]);
        let averageLength = (width + height) / 2;
        let interpolationLength = averageLength / interpolationCount;
        // 计算多边形边的插值
        let minLat = bbox[1] > bbox[3] ? bbox[3] : bbox[1];

        let pointFeatureCollection = turf.featureCollection([]);

        for(let i = 0; i <= interpolationCount; i++){
            let lat = minLat + interpolationLength * i;
            let lineFeature = turf.lineString([[bbox[0], lat], [bbox[2], lat]]);
            let lngs = [];
            //获取交叉点
            let intersects = turf.lineIntersect(lineFeature, polygonFeature);
            if(intersects && intersects.features && intersects.features.length > 0){
                for(let feature of intersects.features){
                    pointFeatureCollection.features.push(feature);
                    lngs.push(feature.geometry.coordinates[0]);
                }
            }

            // 计算多边形内部的插值(遍历获取)
            lngs.sort((a,b) => { return a-b; });
            // 判断2个点之间的部分是否属于内部
            if(lngs.length > 1){
                for(let j = 0; j < lngs.length - 1; j++){
                    let midPoint = [(lngs[j] + lngs[j + 1]) / 2, lat];
                    let pointFeature = turf.point(midPoint);
                    let pointWithin = turf.pointsWithinPolygon(pointFeature, polygonFeature);
                    if(pointWithin && pointWithin.features && pointWithin.features.length > 0){
                        //存在多边形内部
                        let currentLng = lngs[j];
                        let maxLng = lngs[j + 1];
                        while (true){
                            currentLng += interpolationLength;
                            if(currentLng >= maxLng){  //结束循环
                                break;
                            }
                            pointFeatureCollection.features.push(turf.point([currentLng, lat]));
                        }
                    }
                }
            }
        }

        return pointFeatureCollection;
    }

    /**
     * 获取三角面的高度和面积
     * @param triangleFeature
     */
    getTriangleHeightAndArea(triangleFeature){
        return new Promise((resolve, reject) => {
            let result = {
                height: 0,
                area: 0,
            }
            result.area = turf.area(triangleFeature);
            //通过map获取3个点的高度，计算平均值
            let coordinates = triangleFeature.geometry.coordinates[0];
            let coorLength = coordinates.length - 1;
            let heightTotal = 0;
            for(let i = 0; i < coorLength; i++){
                let lnglat = coordinates[i];
                let elevation = this.map.queryTerrainElevation(lnglat);
                elevation = elevation ? elevation : 0;
                heightTotal += elevation;
            }
            result.height = heightTotal / coorLength;

            resolve(result);
        })
    }
}

export default CutFillAnalysis;
