import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {DRACOLoader} from "three/examples/jsm/loaders/DRACOLoader";
import {KTX2Loader} from "three/examples/jsm/loaders/KTX2Loader";
import {MeshoptDecoder} from "three/examples/jsm/libs/meshopt_decoder.module.js";

import {setModelPositionByJson, setModelUseTerrainHeightOption} from "../manage/ThreePositionManage";
import ResourceTracker from "../utils/resourceTracker";
import ClassificationPrimitive from "../effect/ClassificationPrimitive";
import CoorTransformUtils from "../utils/CoorTransformUtils";

import threejsProperty from "../manage/threejsProperty";
// 定义resMgr和track用来清理three
let resMgr = new ResourceTracker();


var Mapbox3DTiles = (function (exports) {
    'use strict';


    const TilesetLayerDefaultParams = {
        MAXIMUM_SCREEN_SPACE_ERROR: 16,
        MAXIMUM_MEMORY_USAGE: 512,
    };

    let internalGLTFCache = new Map();

    class TileLoader {
        constructor(url) {
            this.url = url;
            this.type = url.slice(-4);
            this.version = null;
            this.byteLength = null;
            this.featureTableJSON = null;
            this.featureTableBinary = null;
            this.batchTableJson = null;
            this.batchTableBinary = null;
            this.binaryData = null;
        }
        // TileLoader.load
        async load() {
            let response = await fetch(this.url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} - ${response.statusText}`);
            }
            let buffer = await response.arrayBuffer();
            let res = await this.parseResponse(buffer);
            return res;
        }
        async parseResponse(buffer) {
            let header = new Uint32Array(buffer.slice(0, 32));
            let decoder = new TextDecoder();
            let magic = decoder.decode(new Uint8Array(buffer.slice(0, 4)));
            if (magic != this.type) {
                throw new Error(`Invalid magic string, expected '${this.type}', got '${this.magic}'`);
            }
            this.version = header[1];
            this.byteLength = header[2];
            let featureTableJSONByteLength = header[3];
            let featureTableBinaryByteLength = header[4];
            let batchTableJsonByteLength = header[5];
            let batchTableBinaryByteLength = header[6];
            let gltfFormat = magic === 'i3dm' ? header[7] : 1;


            let pos = magic === 'i3dm' ? 32 : 28; // header length
            if (featureTableJSONByteLength > 0) {
                this.featureTableJSON = JSON.parse(
                    decoder.decode(new Uint8Array(buffer.slice(pos, pos + featureTableJSONByteLength)))
                );
                pos += featureTableJSONByteLength;
            } else {
                this.featureTableJSON = {};
            }
            this.featureTableBinary = buffer.slice(pos, pos + featureTableBinaryByteLength);
            pos += featureTableBinaryByteLength;
            if (batchTableJsonByteLength > 0) {
                this.batchTableJson = JSON.parse(
                    decoder.decode(new Uint8Array(buffer.slice(pos, pos + batchTableJsonByteLength)))
                );
                pos += batchTableJsonByteLength;
            } else {
                this.batchTableJson = {};
            }
            this.batchTableBinary = buffer.slice(pos, pos + batchTableBinaryByteLength);
            pos += batchTableBinaryByteLength;
            if (gltfFormat === 1) {
                this.binaryData = buffer.slice(pos);
            } else {
                // load binary data from url at pos
                let modelUrl = decoder.decode(new Uint8Array(buffer.slice(pos)));
                if (internalGLTFCache.has(modelUrl)) {
                    this.binaryData = internalGLTFCache.get(modelUrl);
                } else {
                    let response = await fetch(modelUrl);
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status} - ${response.statusText}`);
                    }
                    this.binaryData = await response.arrayBuffer();
                    internalGLTFCache.set(modelUrl, this.binaryData);
                }
            }
            return this;
        }
    }

    class B3DM extends TileLoader {
        constructor(url) {
            super(url);
            this.glbData = null;
        }
        async parseResponse(buffer) {
            await super.parseResponse(buffer);
            this.glbData = this.binaryData;
            return this;
        }
    }

    class CMPT extends TileLoader {
        constructor(url) {
            super(url);
        }
        async parseResponse(buffer) {
            let header = new Uint32Array(buffer.slice(0, 4*4));
            let decoder = new TextDecoder();
            let magic = decoder.decode(new Uint8Array(buffer.slice(0, 4)));
            if (magic != this.type) {
                throw new Error(`Invalid magic string, expected '${this.type}', got '${this.magic}'`);
            }
            this.version = header[1];
            this.byteLength = header[2];
            this.tilesLength = header[3];
            let innerTiles = [];
            let tileStart  = 16;
            for (let i = 0; i < this.tilesLength; i++) {
                let tileHeader = new Uint32Array(buffer.slice(tileStart, tileStart + 3 * 4));
                let tileMagic = decoder.decode(new Uint8Array(buffer.slice(tileStart, tileStart + 4)));
                //console.log(`innerTile: ${i}, magic: ${tileMagic}`);
                let tileByteLength = tileHeader[2];
                let tileData = buffer.slice(tileStart, tileStart + tileByteLength);
                innerTiles.push({type: tileMagic, data: tileData});
                tileStart += tileByteLength;
            }
            return innerTiles;
        }
    }

    class PNTS extends TileLoader {
        constructor(url) {
            super(url);
            this.points = new Float32Array();
            this.rgba = null;
            this.rgb = null;
        }
        parseResponse(buffer) {
            super.parseResponse(buffer);
            if (this.featureTableJSON.POINTS_LENGTH && this.featureTableJSON.POSITION) {
                let len = this.featureTableJSON.POINTS_LENGTH;
                let pos = this.featureTableJSON.POSITION.byteOffset;
                this.points = new Float32Array(
                    this.featureTableBinary.slice(pos, pos + len * Float32Array.BYTES_PER_ELEMENT * 3)
                );
                this.rtc_center = this.featureTableJSON.RTC_CENTER;
                if (this.featureTableJSON.RGBA) {
                    pos = this.featureTableJSON.RGBA.byteOffset;
                    let colorInts = new Uint8Array(
                        this.featureTableBinary.slice(pos, pos + len * Uint8Array.BYTES_PER_ELEMENT * 4)
                    );
                    let rgba = new Float32Array(colorInts.length);
                    for (let i = 0; i < colorInts.length; i++) {
                        rgba[i] = colorInts[i] / 255.0;
                    }
                    this.rgba = rgba;
                } else if (this.featureTableJSON.RGB) {
                    pos = this.featureTableJSON.RGB.byteOffset;
                    let colorInts = new Uint8Array(
                        this.featureTableBinary.slice(pos, pos + len * Uint8Array.BYTES_PER_ELEMENT * 3)
                    );
                    let rgb = new Float32Array(colorInts.length);
                    for (let i = 0; i < colorInts.length; i++) {
                        rgb[i] = colorInts[i] / 255.0;
                    }
                    this.rgb = rgb;
                } else if (this.featureTableJSON.RGB565) {
                    console.error('RGB565 is currently not supported in pointcloud tiles.');
                }
            }
            return this;
        }
    }

    function YToLat(Y) {
        return (Math.atan(Math.pow(Math.E, ((Y / 111319.490778) * Math.PI) / 180.0)) * 360.0) / Math.PI - 90.0;
    }

    function LatToScale(lat) {
        return 1 / Math.cos((lat * Math.PI) / 180);
    }

    async function IMesh(inmesh, instancesParams, inverseMatrix) {
        /* intancesParams {
            positions: float32[]
            rtcCenter?: float32[3]
            normalsRight?: float32[]
            normalsUp?: float32[]
            scales?: float32[]
            xyzScales?: float32[]
        } */
        let matrix = new THREE.Matrix4();
        let position = new THREE.Vector3();
        let rotation = new THREE.Euler();
        let quaternion = new THREE.Quaternion();
        let scale = new THREE.Vector3();
        let rtcCenter = instancesParams.rtcCenter ? instancesParams.rtcCenter : [0.0, 0.0, 0.0];

        let geometry = inmesh.geometry;
        geometry.applyMatrix4(inmesh.matrixWorld); // apply world modifiers to geometry

        let material = inmesh.material;
        let positions = instancesParams.positions;
        let instanceCount = positions.length / 3;
        let instancedMesh = new THREE.InstancedMesh(geometry, material, instanceCount);
        instancedMesh.userData = inmesh.userData;

        if (instancesParams.rtcCenter) {
            rtcCenter = instancesParams.rtcCenter;
        }

        for (let i = 0; i < instanceCount; i++) {
            position = {
                x: positions[i * 3] + (rtcCenter[0] + inverseMatrix.elements[12]),
                y: positions[i * 3 + 1] + (rtcCenter[1] + inverseMatrix.elements[13]),
                z: positions[i * 3 + 2] + (rtcCenter[2] + inverseMatrix.elements[14])
            };
            if (instancesParams.normalsRight) {
                rotation.set(0, 0, Math.atan2(instancesParams.normalsRight[i * 3 + 1], instancesParams.normalsRight[i * 3]));
                quaternion.setFromEuler(rotation);
            }
            scale.x = scale.y = scale.z = LatToScale(YToLat(positions[i * 3 + 1]));
            if (instancesParams.scales) {
                scale.x *= instancesParams.scales[i];
                scale.y *= instancesParams.scales[i];
                scale.z *= instancesParams.scales[i];
            }
            if (instancesParams.xyzScales) {
                scale.x *= instancesParams.xyzScales[i * 3];
                scale.y *= instancesParams.xyzScales[i * 3 + 1];
                scale.z *= instancesParams.xyzScales[i * 3 + 2];
            }
            matrix.compose(position, quaternion, scale);
            instancedMesh.setMatrixAt(i, matrix);
            instancedMesh.castShadow = true;
        }

        return instancedMesh;
    }

    class ThreeDeeTile {
        constructor(json, resourcePath, styleParams, updateCallback, parentRefine, parentUpAxis, parentTransform, projectToMercator, tileset, parent) {
            this.loaded = false;
            this.tileset = tileset;
            this.styleParams = styleParams;
            this.updateCallback = updateCallback;
            this.resourcePath = resourcePath;
            this.projectToMercator = projectToMercator;
            this.totalContent = new THREE.Group();  // Three JS THREE.Object3D Group for this tile and all its children
            this.tileContent = new THREE.Group();    // Three JS THREE.Object3D Group for this tile's content
            this.childContent = new THREE.Group();    // Three JS THREE.Object3D Group for this tile's children
            this.totalContent.add(this.tileContent);
            this.totalContent.add(this.childContent);
            this.boundingVolume = json.boundingVolume;
            this.parent = parent ? parent : null;
            //统计使用的内存
            this.totalMemoryUsageInBytes = 0;
            //是否已经卸载瓦片
            this.unloadedTileContent = false;
            //瓦片缓存是否存在
            this.tileContentCache = false;
            //判断当前瓦片为tileset.json类型以及是否已经加载将子节点放入childContent
            this.isTilesetJson = false;
            this.tilesetLoaded = false;

            /**  2021-08-10 17:14  caijy  处理模型up坐标轴  start */
            if (parentUpAxis === 'Z'){
                let rotateX = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
                this.tileContent.applyMatrix4(rotateX); // convert from GLTF Y-up to Z-up
            }
            /**  2021-08-10 17:14  caijy  处理模型up坐标轴  end */
            if (this.boundingVolume) {
                if(this.boundingVolume.box){
                    let b = this.boundingVolume.box;
                    let extent = [b[0] - b[3], b[1] - b[7], b[0] + b[3], b[1] + b[7]];
                    let sw, ne
                    if(parentUpAxis == 'Z'){        // 统一成盒子的高度是y轴的值
                        sw = new THREE.Vector3(extent[0], b[2] - b[11], extent[1]);
                        ne = new THREE.Vector3(extent[2], b[2] + b[11], extent[3]);
                        this.boxCenter = {x:b[0], y:b[2], z:b[1]}
                        this.boxShiftY = b[2] - b[11]
                    }else if(parentUpAxis == 'Y'){
                        sw = new THREE.Vector3(extent[0], extent[1], b[2] - b[11]);
                        ne = new THREE.Vector3(extent[2], extent[3], b[2] + b[11]);
                        this.boxCenter = {x: b[0], y: b[1], z:b[2]}
                        this.boxShiftY = b[1] - b[7]
                    }

                    this.box = new THREE.Box3(sw, ne);
                    /*{
                        //ToDo: I3BM doesn't seem to work without the debugLine, add a transparant one for now
                        let line = new THREE.LineSegments(  new THREE.EdgesGeometry(new THREE.BoxGeometry(b[3] * 2, b[7] * 2, b[11] * 2)), new THREE.LineBasicMaterial( {color: new THREE.Color(0xff0000), transparent: true, linewidth: 0, depthWrite: false, visible: true, opacity: 0.0}) );
                        this.debugLine = line;
                    }*/
                }else if(this.boundingVolume.sphere){     //解析sphere球形包围盒
                    let sphere = this.boundingVolume.sphere;
                    let x = sphere[0];
                    let y = sphere[1];
                    let z = sphere[2];
                    let radius = sphere[3];
                    let sw = new THREE.Vector3(x-radius, y-radius, z-radius);
                    let ne = new THREE.Vector3(x+radius, y+radius, z+radius);
                    this.box = new THREE.Box3(sw, ne);
                }
            } else {
                this.extent = null;
                this.sw = null;
                this.ne = null;
                this.box = null;
                this.center = null;
            }
            /** 2021-08-10 11:01 lidy 处理refine参数 start */
            this.refine = json.refine ? json.refine.toUpperCase() : parentRefine;
            if(json.refine){
                this.refine = json.refine.toUpperCase();
            }else if(this.parent){
                this.refine = parent.refine;
            }else{
                this.refine = "REPLACE";
            }
            /** 2021-08-10 11:01 lidy 处理refine参数 end */

            this.geometricError = json.geometricError;
            this.worldTransform = parentTransform ? parentTransform.clone() : new THREE.Matrix4();
            this.transform = json.transform;
            if (this.transform)
            {
                let tileMatrix = new THREE.Matrix4().fromArray(this.transform);
                this.totalContent.applyMatrix4(tileMatrix);
                // this.totalContent.matrix.decompose(this.totalContent.position, this.totalContent.quaternion, this.totalContent.scale);
                this.worldTransform.multiply(tileMatrix);
            }
            this.content = json.content;
            //判断是否为json类型
            if (this.content) {
                let url = this.content.uri ? this.content.uri : this.content.url;
                if(url){
                    let type = url.slice(-4);
                    if(type && type === "json"){
                        this.isTilesetJson = true;
                    }
                }
            }

            this.children = [];
            if (json.children) {
                for (let i = 0; i < json.children.length; i++) {
                    let child = new ThreeDeeTile(json.children[i], resourcePath, styleParams, updateCallback, this.refine, parentUpAxis, this.worldTransform, this.projectToMercator, this.tileset, this);
                    this.childContent.add(child.totalContent);
                    this.children.push(child);
                }
            }
        }
        /** 2021-08-19 09:40 lidy ClassificationPrimitive实现 start */
        addMeshToClassificationPrimitive(){
            if(this.tileset && this.tileset.tilesetLayer && this.tileset.tilesetLayer.classificationPrimitive){
                this.tileset.tilesetLayer.classificationPrimitive.addMesh(this.tileContent);
            }
        }
        removeMeshToClassificationPrimitive(){
            if(this.tileset && this.tileset.tilesetLayer && this.tileset.tilesetLayer.classificationPrimitive){
                this.tileset.tilesetLayer.classificationPrimitive.removeMesh(this.tileContent);
            }
        }
        /** 2021-08-19 09:40 lidy ClassificationPrimitive实现 end */

        //ThreeDeeTile.load
        async load() {
            /*if (this.unloadedTileContent && this.tileContentCache) {
                this.totalContent.add(this.tileContent);
                this.unloadedTileContent = false;
            }
            if (this.unloadedChildContent) {
                this.totalContent.add(this.childContent);
                this.unloadedChildContent = false;
            }
            if (this.unloadedDebugContent) {
                this.totalContent.add(this.debugLine);
                this.unloadedDebugContent = false;
            }*/

            this.isReader = false;

            if (this.unloadedTileContent) {
                // this.totalContent.add(this.tileContent);
                this.tileContent.visible = true;
                this.unloadedTileContent = false;
            }
            if (this.loaded) {
                this.addMeshToClassificationPrimitive();
                this.updateCallback();
                return;
            }
            this.loaded = true;

            /*if (this.debugLine) {
                this.totalContent.add(this.debugLine);
            }*/
            if (this.content) {
                let url = this.content.uri ? this.content.uri : this.content.url;
                if (!url) return;
                if (url.substr(0, 4) != 'http')
                    url = this.resourcePath + url;
                let type = url.slice(-4);
                switch (type) {
                    case 'json':
                        // child is a tileset json
                        try {
                            let subTileset = new TileSet(()=>this.updateCallback());
                            subTileset.tilesetLayer = this.tileset.tilesetLayer;
                            /**  2021-07-23 11:17  lidy  处理json类型子节点矩阵转换问题  start */
                            await subTileset.load(url, this.styleParams, this.projectToMercator, this.worldTransform, this.tileset, this);
                            if (subTileset.root) {
                                /*this.box.applyMatrix4(this.worldTransform);
                                let inverseMatrix = new THREE.Matrix4().copy(this.worldTransform).invert();
                                this.totalContent.applyMatrix4(inverseMatrix);
                                this.totalContent.updateMatrixWorld();
                                this.worldTransform = new THREE.Matrix4();*/
                                /**  2021-07-23 11:17 lidy  处理json类型子节点矩阵转换问题  end */
                                this.children.push(subTileset.root);
                                this.childContent.add(subTileset.root.totalContent);
                                this.tilesetLoaded = true;
                                subTileset.root.totalContent.updateMatrixWorld();
                                await subTileset.root.checkLoad(this.frustum, this.cameraPosition);
                            }
                        } catch (error) {
                            // load failed (wrong url? connection issues?)
                            // log error, do not break program flow
                            console.error(error);
                        }
                        break;
                    case 'b3dm':
                        try {
                            let b3dm = new B3DM(url);
                            let b3dmData = await b3dm.load();
                            await this.b3dmAdd(b3dmData, url);
                        } catch (error) {
                            console.error(error);
                        }
                        break;
                    case 'i3dm':
                        try {
                            let i3dm = new B3DM(url);
                            let i3dmData = await i3dm.load();
                            this.i3dmAdd(i3dmData);

                        } catch (error) {
                            console.error(error.message);
                        }
                        break;
                    case 'pnts':
                        try {
                            let pnts = new PNTS(url);
                            let pointData = await pnts.load();
                            this.pntsAdd(pointData);
                        } catch (error) {
                            console.error(error);
                        }
                        break;
                    case 'cmpt':
                        let cmpt = new CMPT(url);
                        let compositeTiles = await cmpt.load();
                        this.cmptAdd(compositeTiles, url);
                        break;
                    default:
                        throw new Error('invalid tile type: ' + type);
                }
            }
            this.addMeshToClassificationPrimitive();
            this.updateCallback();
            return;
        }
        async cmptAdd(compositeTiles, url) {
            for (let innerTile of compositeTiles) {
                switch(innerTile.type) {
                    case 'i3dm':
                        let i3dm = new B3DM('.i3dm');
                        let i3dmData = await i3dm.parseResponse(innerTile.data);
                        this.i3dmAdd(i3dmData);
                        break;
                    case 'b3dm':
                        let b3dm = new B3DM('.b3dm');
                        let b3dmData = await b3dm.parseResponse(innerTile.data);
                        this.b3dmAdd(b3dmData, url.slice(0,-4) + 'b3dm');
                        break;
                    case 'pnts':
                        let pnts = new PNTS('.pnts');
                        let pointData = pnts.parseResponse(innerTile.data);
                        this.pntsAdd(pointData);
                        break;
                    case 'cmpt':
                        let cmpt = new CMPT('.cmpt');
                        let subCompositeTiles = CMPT.parseResponse(innerTile.data);
                        this.cmptAdd(subCompositeTiles);
                        break;
                    default:
                        console.error(`Composite type ${innerTile.type} not supported`);
                        break;
                }
                // console.log(`type: ${innerTile.type}, size: ${innerTile.data.byteLength}`);
            }
        }
        pntsAdd(pointData) {
            //统计使用的内存
            this.loadMemoryUsageAdd(pointData.points.byteLength);

            let geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(pointData.points, 3));
            let material = new THREE.PointsMaterial();
            material.size = this.styleParams.pointsize != null ? this.styleParams.pointsize : 1.0;
            if (this.styleParams.color) {
                material.vertexColors = THREE.NoColors;
                material.color = new THREE.Color(this.styleParams.color);
                material.opacity = this.styleParams.opacity != null ? this.styleParams.opacity : 1.0;
            } else if (pointData.rgba) {
                geometry.setAttribute('color', new THREE.Float32BufferAttribute(pointData.rgba, 4));
                material.vertexColors = THREE.VertexColors;
            } else if (pointData.rgb) {
                geometry.setAttribute('color', new THREE.Float32BufferAttribute(pointData.rgb, 3));
                material.vertexColors = THREE.VertexColors;
            }
            this.tileContent.add(new THREE.Points( geometry, material ));
            if (pointData.rtc_center) {
                let c = pointData.rtc_center;
                this.tileContent.applyMatrix4(new THREE.Matrix4().makeTranslation(c[0], c[1], c[2]));
            }
            this.tileContent.add(new THREE.Points( geometry, material ));

            this.tileContentCache = true;
        }
        b3dmAdd(b3dmData, url) {
            //统计使用的内存
            this.loadMemoryUsageAdd(b3dmData.glbData.byteLength);
            let loader = new GLTFLoader()
            loader
                .setCrossOrigin('anonymous')
                .setDRACOLoader(
                    new DRACOLoader()
                        .setDecoderPath('/draco/')
                )
                .setKTX2Loader(
                    new KTX2Loader()
                        .setTranscoderPath('/basis/')
                        .detectSupport(threejsProperty.renderer)
                )
                .setMeshoptDecoder(MeshoptDecoder);

            return new Promise((resolve, reject) => {
                loader.parse(b3dmData.glbData, this.resourcePath, (gltf) => {
                        let scene = gltf.scene || gltf.scenes[0];

                        if (this.projectToMercator) {
                            //TODO: must be a nicer way to get the local Y in webmerc. than worldTransform.elements
                            scene.scale.setScalar(LatToScale(YToLat(this.worldTransform.elements[13])));
                        }
                        scene.traverse(child => {
                            if (child instanceof THREE.Mesh) {
                                // some gltf has wrong bounding data, recompute here
                                child.geometry.computeBoundingBox();
                                child.geometry.computeBoundingSphere();
                                child.castShadow = true;

                                child.material.depthWrite = !child.material.transparent; // necessary for Velsen dataset?
                                //Add the batchtable to the userData since gltfLoader doesn't deal with it
                                /**  2021-07-30 14:57  caijy  处理模型属性获取（lod模型直接使用原有属性）  start */
                                child.userData = Object.keys(child.userData).length === 0 ? b3dmData.batchTableJson : child.userData;
                                // child.userData.org_name = child.name
                                /**  2021-07-30 14:57  caijy  处理模型属性获取  start */
                                child.userData.b3dm = url.replace(this.resourcePath, '').replace('.b3dm', '');
                            }
                        });
                        if (this.styleParams.color != null || this.styleParams.opacity != null) {
                            let color = new THREE.Color(this.styleParams.color);
                            scene.traverse(child => {
                                if (child instanceof THREE.Mesh) {
                                    if (this.styleParams.color != null)
                                        child.material.color = color;
                                    if (this.styleParams.opacity != null) {
                                        child.material.opacity = this.styleParams.opacity;
                                        child.material.transparent = this.styleParams.opacity < 1.0 ? true : false;
                                    }
                                }
                            });
                        }
                        if (this.debugColor) {
                            scene.traverse(child => {
                                if (child instanceof THREE.Mesh) {
                                    child.material.color = this.debugColor;
                                }
                            });
                        }
                        this.tileContent.add(scene);
                        scene.updateMatrixWorld(true);

                        this.tileContentCache = true;
                        resolve()
                    }, (error) => {
                        throw new Error('error parsing gltf: ' + error);
                    }
                );
            })
        }

        i3dmAdd(i3dmData) {
            //统计使用的内存
            this.loadMemoryUsageAdd(i3dmData.glbData.byteLength);

            let loader = new GLTFLoader()
            loader
                .setCrossOrigin('anonymous')
                .setDRACOLoader(
                    new DRACOLoader()
                        .setDecoderPath('/draco/')
                )
                .setKTX2Loader(
                    new KTX2Loader()
                        .setTranscoderPath('/basis/')
                        .detectSupport(threejsProperty.renderer)
                )
            // Check what metadata is present in the featuretable, currently using: https://github.com/CesiumGS/3d-tiles/tree/master/specification/TileFormats/Instanced3DModel#instance-orientation.
            let metadata = i3dmData.featureTableJSON;
            if (!metadata.POSITION) {
                console.error(`i3dm missing position metadata`);
                return;
            }
            let instancesParams = {
                positions : new Float32Array(i3dmData.featureTableBinary, metadata.POSITION.byteOffset, metadata.INSTANCES_LENGTH * 3)
            };
            if (metadata.RTC_CENTER) {
                if (Array.isArray(metadata.RTC_CENTER) && metadata.RTC_CENTER.length === 3) {
                    instancesParams.rtcCenter = [metadata.RTC_CENTER[0], metadata.RTC_CENTER[1],metadata.RTC_CENTER[2]];
                }
            }
            if (metadata.NORMAL_UP && metadata.NORMAL_RIGHT) {
                instancesParams.normalsRight = new Float32Array(i3dmData.featureTableBinary, metadata.NORMAL_RIGHT.byteOffset, metadata.INSTANCES_LENGTH * 3);
                instancesParams.normalsUp = new Float32Array(i3dmData.featureTableBinary, metadata.NORMAL_UP.byteOffset, metadata.INSTANCES_LENGTH * 3);
            }
            if (metadata.SCALE) {
                instancesParams.scales = new Float32Array(i3dmData.featureTableBinary, metadata.SCALE.byteOffset, metadata.INSTANCES_LENGTH);
            }
            if (metadata.SCALE_NON_UNIFORM) {
                instancesParams.xyzScales = new Float32Array(i3dmData.featureTableBinary, metadata.SCALE_NON_UNIFORM.byteOffset, metadata.INSTANCES_LENGTH);
            }
            let inverseMatrix = new THREE.Matrix4().copy(this.worldTransform).invert(); // in order to offset by the tile
            let self = this;
            loader.parse(i3dmData.glbData, this.resourcePath, (gltf) => {
                let scene = gltf.scene || gltf.scenes[0];
                scene.rotateX(Math.PI / 2); // convert from GLTF Y-up to Mapbox Z-up
                scene.updateMatrixWorld(true);

                scene.traverse(child => {
                    if (child instanceof THREE.Mesh) {
                        child.userData = i3dmData.batchTableJson;
                        IMesh(child, instancesParams, inverseMatrix)
                            .then(d=>self.tileContent.add(d));
                    }
                });

                this.tileContentCache = true;
            });
        }

        /**
         * 内存使用情况
         * @param byteLength
         */
        loadMemoryUsageAdd(byteLength){
            //加载到threejs中内存大概为gltf文件的8倍
            byteLength = byteLength * 8;

            this.tileset.tilesetLayer.totalMemoryUsageInBytes += byteLength;
            this.totalMemoryUsageInBytes += byteLength;
        }
        loadLayerMemoryUsage(){
            this.tileset.tilesetLayer.totalMemoryUsageInBytes += this.totalMemoryUsageInBytes;
        }
        unloadLayerMemoryUsage(){
            this.tileset.tilesetLayer.totalMemoryUsageInBytes -= this.totalMemoryUsageInBytes;
            this.totalMemoryUsageInBytes = 0;
        }

        /**
         * 卸载多余的缓存
         * @return {Promise<void>}
         */
        unloadNoDisplayCache(){
            if(!this.tileset.isReader){
                return;
            }
            if(this.unloadedTileContent && this.tileContentCache){
                this.unloadCache();
                if(this.tileset && this.tileset.tilesetLayer && this.tileset.tilesetLayer.maximumMemoryUsage * 0.9 > this.tileset.tilesetLayer.totalMemoryUsageInBytes/(1024*1024)){
                    return;
                }
            }
            if(this.children && this.children.length > 0){
                for(let i = 0; i < this.children.length; i++){
                    this.children[i].unloadNoDisplayCache();
                }
            }
            return;
        }
        /**
         * 卸载缓存
         * @param includeChildren
         */
        unloadCache(){
            //todo: 卸载tileContent中的内容
            // this.tileContent.clear();   //todo: 替换成其他的销毁方法
            if(this.tileContent.children && this.tileContent.children.length > 0){
                for(let i = 0; i< this.tileContent.children.length; i++){
                    resMgr.track(this.tileContent.children[i]);
                }
                resMgr.dispose();
            }
            this.unloadLayerMemoryUsage();
            this.tileContentCache = false;
            this.loaded = false;
        }


        /**
         * 定时卸载
         * @param includeChildren
         * @param time 单位ms
         */
        timeoutUnload(includeChildren, time){
            if (threejsProperty) {
                let _this = this;
                let waitTime
                if (threejsProperty.tilesetLayers.length < 5) {
                    waitTime = time * threejsProperty.tilesetLayers.length
                } else {
                    waitTime = time * 5
                }
                _this.isReader = true;
                setTimeout(function () {
                    if (_this.isReader) {
                        _this.unload(includeChildren);
                    }
                }, waitTime)
            }
        }

        async unload(includeChildren) {
            this.unloadedTileContent = true;
            // this.totalContent.remove(this.tileContent);
            this.tileContent.visible = false;

            this.removeMeshToClassificationPrimitive();

            //unload孩子节点
            if(includeChildren){
                for (let i=0; i<this.children.length; i++) {
                    this.children[i].unload(true);
                }
            }
            //this.tileContent.visible = false;
            this.updateCallback();
            // TODO: should we also free up memory?
        }
        async unloadParents(tile){
            if (tile.parent){
                tile.parent.unload(false);

                this.unloadParents(tile.parent)
            }
        }

        async checkLoad(frustum, cameraPosition, loadTime, oldTime) {
            if (threejsProperty && !threejsProperty.isDispose) {
                if (this.tileset) {
                    this.tileset.isReader = false;
                }
                let coorTransformUtils = this.tileset.coorTransformUtils;
                /** 2021-08-12 09:46  处理渲染多帧时执行多次深度遍历 start */
                this.tileset.loadTime = loadTime || this.tileset.loadTime;
                loadTime = oldTime || loadTime;
                if (loadTime && this.tileset.loadTime && loadTime != this.tileset.loadTime) {
                    return;
                }
                /** 2021-08-12 09:46  处理渲染多帧时执行多次深度遍历 end */
                /** 2021-08-12 11:10  async方法返回结果, 判断是否有加载 start */
                let result = {isLoad: false, childRefine: null, hasChildLoadCache: false};
                /** 2021-08-12 11:10  async方法返回结果, 判断是否有加载 end */

                this.frustum = frustum;
                this.cameraPosition = cameraPosition;

                // 只渲染相机范围内的瓦片（有利于提高性能）(相机范围需要加宽)
                let transformedBox = this.box.clone();
                // transformedBox.applyMatrix4(this.totalContent.matrixWorld);
                transformedBox.applyMatrix4(this.totalContent.children[1].matrixWorld);
                // is this tile visible?
                if (!frustum.intersectsBox(transformedBox)) {
                    this.unload(true);
                    return result;
                }

                /**  2021-08-10 16:04  caijy 计算层级模型group包围盒，获取相机到包围盒距离  start*/
                let dist = 0;
                if (this.objectBox && !this.tileset.tilesetLayer.terrainHeightChange) {   //如果地形发生变化，这个东西的box也需要发生变化
                    dist = this.objectBox.distanceToPoint(cameraPosition);
                } else {
                    this.tileset.tilesetLayer.terrainHeightChange = false;

                    let objectBox = new THREE.Box3();
                    objectBox.expandByObject(this.tileset.tilesetLayer.world.children[0])
                    let objectBoxOrg = objectBox.clone()
                    let objectSize = new THREE.Vector3()
                    objectBox.getSize(objectSize)          // 获得包围盒长宽高尺寸，结果保存在参数三维向量对象v3中

                    objectBox.max = coorTransformUtils.threeWorldToLocal(objectBox.max, threejsProperty.mercatorWorld)
                    objectBox.min = coorTransformUtils.threeWorldToLocal(objectBox.min, threejsProperty.mercatorWorld)
                    let box1 = this.box.clone()
                    if (objectBox.max.x) {
                        dist = objectBox.distanceToPoint(cameraPosition);
                        this.objectBox = objectBox
                        this.objectSize = objectSize
                        this.objectBoxOrg = objectBoxOrg
                    } else if (box1) {
                        let originMatrix = new THREE.Matrix4().copy(threejsProperty.mercatorWorld.matrix).invert();
                        originMatrix.multiply(this.totalContent.children[1].matrixWorld);
                        box1.applyMatrix4(originMatrix)
                        dist = box1.distanceToPoint(cameraPosition);
                    } else {
                        // 偏移原始包围盒
                        let matrix_ = null;
                        if (this.tileset && this.tileset.transformSelf) {
                            matrix_ = this.worldTransform.clone().multiply(this.tileset.transformSelf)
                        } else {
                            matrix_ = this.worldTransform.clone();
                        }
                        let worldBox = this.box.clone().applyMatrix4(matrix_);
                        dist = worldBox.distanceToPoint(cameraPosition);
                    }
                }
                /**  2021-08-10 16:04  caijy 计算层级模型group包围盒，获取相机到包围盒距离  end*/

                /**  2021-07-23 11:29  lidy load距离倍数修改  */
                let maximumScreenSpaceError = TilesetLayerDefaultParams.MAXIMUM_SCREEN_SPACE_ERROR;
                let maximumMemoryUsage = TilesetLayerDefaultParams.MAXIMUM_MEMORY_USAGE;
                let totalMemoryUsageInBytes = 0;
                if (this.tileset && this.tileset.tilesetLayer) {
                    maximumScreenSpaceError = this.tileset.tilesetLayer.maximumScreenSpaceError;
                    maximumMemoryUsage = this.tileset.tilesetLayer.maximumMemoryUsage;
                    totalMemoryUsageInBytes = this.tileset.tilesetLayer.totalMemoryUsageInBytes;
                }

                maximumScreenSpaceError = 16 * 16 / maximumScreenSpaceError;

                /**  2021-08-06 13:58  caijy  根据屏幕像素和距相机距离计算屏幕空间误差，判断是否渲染瓦片  start */
                    // let canvasHeight = document.getElementsByClassName('mapboxgl-canvas')[0].clientHeight
                let canvasHeight = threejsProperty.renderer.domElement.height
                let screenSpaceError = (this.geometricError * canvasHeight * window.screen.height) / (dist * window.screen.width)

                /**  2021-08-13 15:36  结合replace或add类型调整模型加载卸载逻辑  start */
                if (this.geometricError > 0.0 && screenSpaceError < maximumScreenSpaceError) {
                    result.isLoad = false;
                    this.timeoutUnload(true, 5);
                    // this.unload(true);
                    return result;
                } else if ((this.geometricError > 0.0 && screenSpaceError >= maximumScreenSpaceError) || this.geometricError == 0) {    //geometricError ==0, 直接显示
                    result.isLoad = true;
                    let hasChildLoad = false;
                    result.childRefine = this.refine;

                    let selfRefine = null;
                    let hasChidLoadCache = null;

                    // should we load its children?
                    if (this.children && this.children.length > 0) {
                        hasChildLoad = true;
                        for (let i = 0; i < this.children.length; i++) {
                            let childCheckResult = await this.children[i].checkLoad(frustum, cameraPosition, null, loadTime);
                            if (childCheckResult) {    //子节点全部都加载了，才会卸载自身
                                if (!childCheckResult.isLoad) {
                                    hasChildLoad = false;
                                }
                                if (childCheckResult.childRefine == null) {     // 子级没有子节点，则直接赋本身的值
                                    result.childRefine = this.refine;
                                    selfRefine = this.refine;
                                    result.hasChildLoadCache = this.tileContentCache
                                    hasChidLoadCache = this.tileContentCache
                                } else if (childCheckResult.childRefine) {      // 获取子级refine
                                    selfRefine = childCheckResult.childRefine;
                                    result.childRefine = childCheckResult.childRefine;
                                    result.hasChildLoadCache = childCheckResult.hasChildLoadCache
                                    hasChidLoadCache = childCheckResult.hasChildLoadCache
                                    if (childCheckResult.childRefine === "ADD" && this.refine === "REPLACE") {   // lod模型中默认l3级
                                        result.childRefine = 'REPLACE';
                                    }
                                }
                            }
                        }
                    }
                    //判断是否为json类型而且没有加载
                    if (this.isTilesetJson) {      //json类型的数据第一次加载之后，就不再进行load了， 也不执行unload(他本身没有tile，都放在了children节点了)
                        if (!this.tilesetLoaded) {
                            await this.load();
                        }
                    } else {
                        if (hasChildLoad) {
                            if (selfRefine == 'REPLACE') {        // 加载了replace类型孩子，则卸载本身
                                if (!this.unloadedTileContent) {
                                    if (!hasChidLoadCache) {
                                        this.timeoutUnload(false, 1000);
                                    } else {
                                        this.unload(false)
                                    }
                                }
                            } else {
                                await this.load();
                            }
                        } else {
                            await this.load();
                            // console.log('load',this.content)
                        }
                    }
                    /**  2021-08-13 15:36  结合replace或add类型调整模型加载卸载逻辑  end */

                    //处理内存溢出的情况
                    /*if(maximumMemoryUsage && totalMemoryUsageInBytes && totalMemoryUsageInBytes/(1024*1024) > maximumMemoryUsage){
                        let rootTile = this.tileset.root;
                        await rootTile.unloadNoDisplayCache();
                    }*/
                    return result;

                }
                /**  2021-08-06 13:58  caijy  根据屏幕像素和距相机距离计算屏幕空间误差，判断是否渲染瓦片  end */

            }
        }
    }

    class TileSet {
        constructor(updateCallback) {
            if (!updateCallback) {
                updateCallback = () => {};
            }
            this.updateCallback = updateCallback;
            this.url = null;
            this.version = null;
            this.gltfUpAxis = null;
            this.geometricError = null;
            this.root = null;
            this.geodeticCoor = null;
            this.transform = null;
            this.transformLngLat = null;
            this.transformSelf = null;
            this.tilesetLayer = null;     //方便管理获取layer设置的参数
            this.isReader = false;
            this.box = null;
            this.coorTransformUtils = new CoorTransformUtils();
        }
        // TileSet.load
        async load(url, styleParams, projectToMercator, worldTransform, rootTileset, parentDeeTile) {
            this.url = url;
            let resourcePath = THREE.LoaderUtils.extractUrlBase(url);

            let response = await fetch(this.url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} - ${response.statusText}`);
            }
            let json = await response.json();

            /**  2021-07-23 13:58  caijy  模型坐标系从4978转3857  start */
                // json.geometricError = 2000
                // json.root.geometricError = 2000
            let urlArr = url.split('/')
            let jsonFile = urlArr[urlArr.length - 1]
            if (jsonFile == 'tileset.json' && json.root.transform){   // 不转换孩子节点的json
                let tileMatrix = new THREE.Matrix4().fromArray(json.root.transform)
                let positionVector = new THREE.Vector3()
                positionVector.setFromMatrixPosition(tileMatrix)
                let geodeticCoor = this.coorTransformUtils.descartesToWgs84(positionVector.x, positionVector.y, positionVector.z);
                let centerMapboxMercator = this.coorTransformUtils.wgs84ToThreeLocal(geodeticCoor.lng, geodeticCoor.lat, geodeticCoor.height);
                this.geodeticCoor = geodeticCoor;

                let matrix = new THREE.Matrix4();
                // if (json.asset.generator == 'caijy' || json.asset.generator == 'AgBim'){       // BIM LOD模型旋转缩放处理
                //     let rotateMatrix = new THREE.Matrix4().makeRotationZ(Math.PI);     //沿X轴方向逆时针旋转180度
                //     let scaleMatrix = new THREE.Matrix4().makeScale(0.3, 0.3, 0.3)
                //     matrix.multiply(rotateMatrix)
                //     matrix.multiply(scaleMatrix)
                // }
                // matrix.setPosition(projectedCoor.x, projectedCoor.y, projectedCoor.h);
                matrix.setPosition(centerMapboxMercator.x, centerMapboxMercator.y, centerMapboxMercator.z);

                json.root.transform = matrix.toArray()
                this.transform = json.root.transform;
                this.transformLngLat = geodeticCoor;
            }
            /**  2021-07-23 13:58  caijy  模型坐标系从4978转3857  end */
            this.version = json.asset.version;
            this.upAxis = json.asset.gltfUpAxis ? json.asset.gltfUpAxis : 'Y'       // 未定义up轴的默认是Y-up
            this.geometricError = json.geometricError;
            this.refine = json.root.refine ? json.root.refine.toUpperCase() : 'REPLACE';     //refine属性有ADD(添加)以及REPLACE(替换)
            if (json.asset.generatetool){
                this.generator = json.asset.generatetool
            }else if (json.asset.generator){
                this.generator = json.asset.generator
            } else{
                this.generator = null
            }
            this.root = new ThreeDeeTile(
                json.root,
                resourcePath,
                styleParams,
                this.updateCallback,
                this.refine,
                this.upAxis,
                worldTransform,
                projectToMercator,
                rootTileset ? rootTileset : this,
                parentDeeTile ? parentDeeTile : null
            );
            return;
        }
    }


    class Mapbox3DTilesLayer {
        constructor(params, threejsProperty) {
            if (!params) throw new Error('parameters missing for mapbox 3D tiles layer');
            if (!params.id) throw new Error('id parameter missing for mapbox 3D tiles layer');
            //if (!params.url) throw new Error('url parameter missing for mapbox 3D tiles layer');
            /**  2021-07-27 13:48  xiequan  新增3dtiles经度、纬度、高度geo，用于加载初始化定位 */
            // if (!params.position) throw new Error('position parameter missing for mapbox 3D tiles layer');

            (this.id = params.id), (this.url = params.url), (this.position = params.position), (this.landId = params.landId), (this.useTerrainHeight = params.useTerrainHeight);
            this.styleParams = {};
            this.projectToMercator = params.projectToMercator ? params.projectToMercator : false;
            // this.lights = params.lights ? params.lights : this.getDefaultLights();
            if ('color' in params) this.styleParams.color = params.color;
            if ('opacity' in params) this.styleParams.opacity = params.opacity;
            if ('pointsize' in params) this.styleParams.pointsize = params.pointsize;

            this.loadStatus = 0;
            this.type = 'custom';
            this.renderingMode = '3d';
            this.tilesetLayer = this; // 定义tilesetLayer方便管理
            this.maximumScreenSpaceError = params.maximumScreenSpaceError ? params.maximumScreenSpaceError : TilesetLayerDefaultParams.MAXIMUM_SCREEN_SPACE_ERROR;    //用于驱动细节细化级别的最大屏幕空间误差, 越大显示精细
            this.maximumMemoryUsage = params.maximumMemoryUsage ? params.maximumMemoryUsage : TilesetLayerDefaultParams.MAXIMUM_MEMORY_USAGE;       //最大使用内存(MB)
            this.totalMemoryUsageInBytes = 0;     //使用内存情况(byte)
            this.cleanTileCacheInterval = 0;     //定时器
            /** 2021-08-19 09:40 lidy ClassificationPrimitive实现 start */
            this.classificationPrimitive = null;
            /** 2021-08-19 09:40 lidy ClassificationPrimitive实现 end */

            this.tileType = params.tileType;
            /** 2022-03-28 12:00 lidy 地形高度变化 start */
            this.terrainHeightChange = true;
            /** 2022-03-28 12:00 lidy 地形高度变化 end */


            this.rotateAxis = params.rotateAxis || new THREE.Vector3(0,1,0), // 旋转轴，默认y轴
                this.rotateAngle = params.rotateAngle || 0 // 模型旋转角度，默认为0（正北）
            this.scale = params.scale // 模型缩放

            this.threejsProperty = threejsProperty;
            this.coorTransformUtils = new CoorTransformUtils();
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
            this.mapQueryRenderedFeatures = map.queryRenderedFeatures.bind(this.map);
            this.map.queryRenderedFeatures = this.queryRenderedFeatures.bind(this);
            this.rootTransform = [
                1, 0, 0, 0,
                0, 1, 0, 0,
                0, 0, 1, 0,
                0, 0, 0, 1];

            this.world = new THREE.Group();
            this.world.name = this.id;
            //确认world为3dtiles
            this.world.userData.is3DTiles = true;

            let threejsProperty = this.threejsProperty;
            if (!threejsProperty) {
                console.error('请先初始化agLayer');
                return
            }
            this.scene = threejsProperty.scene
            this.renderer = threejsProperty.renderer
            this.camera = threejsProperty.camera
            this.cameraSync = threejsProperty.cameraSync
            this.lights = threejsProperty.lights
            if(!threejsProperty.worlds) {
                threejsProperty.worlds = [this.world];
            } else {
                threejsProperty.worlds.push(this.world);
            }

            threejsProperty.mercatorWorld.add(this.world);

            /* END OF WIP */
            this.cameraSync.updateCamera()

            //raycaster for mouse events
            this.raycaster = new THREE.Raycaster();
            if (this.url) {
                this.tileset = new TileSet(() => this.map.triggerRepaint());
                this.tileset.tilesetLayer = this.tilesetLayer;
                this.tileset
                    .load(this.url, this.styleParams, this.projectToMercator)
                    .then(() => {
                        if (this.tileset.root) {
                            this.world.add(this.tileset.root.totalContent);
                            this.world.updateMatrixWorld();

                            //添加tileType属性
                            this.tileset.root.totalContent.userData.tileType = this.tileType;

                            /**
                             * 2021-07-27 14:37  xiequan  判断是否有传入坐标，用于加载初始化定位 start
                             */
                            if (this.position) {
                                /**
                                 * 3dtiles房屋模型默认坐标：[116.3912117326133, 39.906894505431175]
                                 * 根据传入的坐标计算出偏移量
                                 */
                                let defaultPro = new THREE.Vector3();
                                defaultPro.setFromMatrixPosition(this.tileset.root.totalContent.matrix.clone());
                                //获取mapbox伪墨卡托坐标
                                let localVector = this.coorTransformUtils.wgs84ToThreeLocal(this.position.lng, this.position.lat, this.position.height, threejsProperty.worldParams.scale);

                                let translateX = localVector.x - defaultPro.x

                                // 高度偏移适配cesiumlab和agBim的模型
                                let shiftYOnRoot = 0
                                let shiftYOnChild = 0
                                if (this.tileset.generator === 'cesiumlab2@www.cesiumlab.com/model2tiles'){
                                    shiftYOnChild = this.tileset.root.boxShiftY
                                }else{
                                    shiftYOnRoot = this.tileset.root.boxShiftY
                                }

                                let translateY = localVector.y - defaultPro.y - shiftYOnRoot
                                let translateZ = localVector.z - defaultPro.z

                                if(!translateX || isNaN(translateX)) {
                                    translateX = 0
                                }
                                if(!translateY || isNaN(translateY)) {
                                    translateY = 0
                                }
                                if(!translateZ || isNaN(translateZ)) {
                                    translateZ = 0
                                }

                                let root = this.tileset.root

                                // 将模型xy中心移到本地坐标原点中心
                                let childMatrix = new THREE.Matrix4();
                                childMatrix.makeTranslation(- this.tileset.root.boxCenter.x, - shiftYOnChild, - this.tileset.root.boxCenter.z)
                                root.childContent.applyMatrix4(childMatrix.clone());

                                let matrix = new THREE.Matrix4();
                                matrix.makeTranslation(translateX, translateY, translateZ)
                                this.tileset.transformSelf = matrix.clone();
                                this.tileset.transformLngLat = {lng: this.position.lng, lat: this.position.lat, height: this.position.height};
                                root.totalContent.applyMatrix4(matrix.clone());

                                /**
                                 * 2021-08-06 11:01  xiequan  根据轴和角度进行旋转
                                 */
                                if (this.rotateAngle) {
                                    if (this.tileset.generator === 'cesiumlab2@www.cesiumlab.com/model2tiles'){     // 旧模型默认朝正南，要按正北方向旋转
                                        this.rotateAngle += 180
                                    }
                                    root.totalContent.rotateOnAxis(this.rotateAxis, this.rotateAngle * Math.PI / 180)
                                }
                                if (this.scale) {
                                    root.totalContent.scale.set(this.scale.x, this.scale.y, this.scale.z)
                                }
                                root.totalContent.updateMatrix()
                                root.totalContent.updateMatrixWorld(true)
                                root.totalContent.updateWorldMatrix(true, true)

                                //添加3dtiles的中心点经纬度
                                setModelPositionByJson(this.tileset.root.totalContent, this.position);
                                if(this.useTerrainHeight){
                                    setModelUseTerrainHeightOption(this.tileset.root.totalContent, this.position.height);
                                }
                            }
                            /**
                             * 2021-07-27 14:37  xiequan  判断是否有传入坐标，用于加载初始化定位 end
                             */

                            this.loadStatus = 1;
                            this.loadVisibleTiles();
                        }
                    })
                    .catch((error) => {
                        console.error(`${error} (${this.url})`);
                    });
                /**
                 * 2021-08-04 11:01 xiequan 将tilesetLayer加入threejsProperty.tilesetLayers中 start */
                let tilesetLayers = threejsProperty.tilesetLayers
                let hasTilesetLayer = false
                // 判断tilesetLayers中是否已存在当前tilesetLayer
                for (let index = 0; index < tilesetLayers.length; index++) {
                    const element = tilesetLayers[index];
                    if (element.id === this.tilesetLayer.id) {
                        hasTilesetLayer = true
                    }
                }
                if (!hasTilesetLayer) {
                    threejsProperty.tilesetLayers.push(this.tilesetLayer)
                }
                /** 2021-08-04 11:01 xiequan 将tilesetLayer加入threejsProperty.tilesetLayers中 end */

                /**  2021-08-13 10:13 lidy 创建定时任务清理超出内存部分 start */
                this.cleanTileCacheTimedTask();
                /**  2021-08-13 10:13 lidy 创建定时任务清理超出内存部分 end */
            }
        }

        onRemove(map, gl) {
            //清除定时任务
            this.removeTimedTask();
        }

        queryRenderedFeatures(geometry, options) {
            let result = this.mapQueryRenderedFeatures(geometry, options);
            if (!this.map || !this.map.transform) {
                return result;
            }
            if (!(options && options.layers && !options.layers.includes(this.id))) {
                if (geometry && geometry.x && geometry.y) {
                    var mouse = new THREE.Vector2();

                    // scale mouse pixel position to a percentage of the screen's width and height
                    mouse.x = (geometry.x / this.map.transform.width) * 2 - 1;
                    mouse.y = 1 - (geometry.y / this.map.transform.height) * 2;

                    this.raycaster.setFromCamera(mouse, this.camera);

                    // calculate objects intersecting the picking ray
                    let intersects = this.raycaster.intersectObjects(this.world.children, true);
                    if (intersects.length) {
                        let feature = {
                            type: 'Feature',
                            properties: {},
                            geometry: {},
                            layer: { id: this.id, type: 'custom 3d' },
                            source: this.url,
                            'source-layer': null,
                            state: {}
                        };
                        let propertyIndex;
                        let intersect = intersects[0];

                        if (intersect.object.userData.b3dm) {
                            feature.properties['b3dm'] = intersect.object.userData.b3dm;
                        }
                        /**  2021-07-30 14:57  caijy  处理模型属性获取（lod模型直接使用原有属性）  start */
                        if (intersect.object.name) {
                            if (intersect.object.name.substring(0,4) === 'mesh'){       // 子节点构件，获取父节点id
                                feature.properties['name'] = intersect.object.parent.name
                            }else{
                                feature.properties['name'] = intersect.object.name;
                            }
                            /**  2021-07-30 14:57  caijy  处理模型属性获取（lod模型直接使用原有属性）  start */
                        }else if (intersect.instanceId) {
                            let keys = Object.keys(intersect.object.userData);
                            if (keys.length) {
                                for (let propertyName of keys) {
                                    feature.properties[propertyName] =
                                        intersect.object.userData[propertyName][intersect.instanceId];
                                }
                            } else {
                                feature.properties.batchId = intersect.instanceId;
                            }
                        } else if (
                            intersect.object &&
                            intersect.object.geometry &&
                            intersect.object.geometry.attributes &&
                            intersect.object.geometry.attributes._batchid
                        ) {
                            let geometry = intersect.object.geometry;
                            let vertexIdx = intersect.faceIndex;
                            if (geometry.index) {
                                // indexed BufferGeometry
                                vertexIdx = geometry.index.array[intersect.faceIndex * 3];
                                propertyIndex = geometry.attributes._batchid.data.array[vertexIdx * 7 + 6];
                            } else {
                                // un-indexed BufferGeometry
                                propertyIndex = geometry.attributes._batchid.array[vertexIdx * 3];
                            }
                            let keys = Object.keys(intersect.object.userData);
                            if (keys.length) {
                                for (let propertyName of keys) {
                                    feature.properties[propertyName] =
                                        intersect.object.userData[propertyName][propertyIndex];
                                }
                            } else {
                                feature.properties.batchId = propertyIndex;
                            }
                        } else {
                            if (intersect.index != null) {
                                feature.properties.index = intersect.index;
                            } else {
                                feature.properties.name = this.id;
                            }
                        }

                        result.unshift(feature);
                        this.map.triggerRepaint();
                    } else {
                        this.outlinedObject = null;
                        if (this.outlineMesh) {
                            let parent = this.outlineMesh.parent;
                            parent.remove(this.outlineMesh);
                            this.outlineMesh = null;
                            this.map.triggerRepaint();
                        }
                    }
                }
            }

            return result;
        }

        render(gl, viewProjectionMatrix) {
        }

        /**
         * 2021-07-30 11:48  xiequan 定义偏移方法 start
         * params: group 要偏移的group
         * params: x x轴偏移量
         * params: y y轴偏移量
         * params: z z轴偏移量
         */
        transform(group, x, y, z) {
            if (!group) {
                console.error('请传入要偏移的对象');
                return
            }
            let matrix = group.matrix.clone()
            matrix.makeTranslation(x, y, z)
            group.applyMatrix4(matrix)
            this.cameraSync.updateCamera()
        }
        /**
         * 2021-07-30 11:48  xiequan 定义偏移方法 end
         */

        /**
         * 2021-08-06 14:48  xiequan 定义旋转方法 start
         * params: group 要旋转的group
         * params: angle 旋转角度，要转成弧度
         * params: axis 旋转轴
         */
        rotateOnAxisAndAngle(group, angle, axis = 'z') {
            if (!group) {
                console.error('请传入要旋转的对象');
                return
            }
            if (!angle) {
                console.error('请传入要旋转的角度');
                return
            }
            let a = null
            if (axis == 'x') {
                a = new THREE.Vector3(1, 0, 0)
            } else if (axis == 'y') {
                a = new THREE.Vector3(0, 1, 0)
            } else if (axis == 'z') {
                a = new THREE.Vector3(0, 0, 1)
            }
            group.rotateOnAxis(a, angle * Math.PI / 180)
            this.cameraSync.updateCamera()
        }
        /**
         * 2021-08-06 14:48  xiequan 定义旋转方法 end
         */

        /**
         * 2021-08-13 10:03 lidy 定时清除瓦片缓存
         */
        cleanTileCacheTimedTask(){
            let _this = this;
            _this.cleanTileCacheInterval = setInterval(function () {
                //判断没有在加载东西
                _this.tileset.isReader = true;
                if(_this.tileset && _this.tileset.root){
                    let maximumMemoryUsage = _this.maximumMemoryUsage;
                    let totalMemoryUsageInBytes = _this.totalMemoryUsageInBytes;
                    if(maximumMemoryUsage && totalMemoryUsageInBytes && totalMemoryUsageInBytes/(1024*1024) > maximumMemoryUsage){
                        let rootTile = _this.tileset.root;
                        rootTile.unloadNoDisplayCache();
                    }
                }
            }, 30  * 1000)
        }
        /**
         * 2021-08-13 10:03 lidy 移除清除瓦片缓存的定时器
         */
        removeTimedTask(){
            if(this.cleanTileCacheInterval){
                clearInterval(this.cleanTileCacheInterval)
            }
        }

        /**
         * 2021-08-19 09:50 lidy ClassificationPrimitive实现
         * @param classificationPrimitive ClassificationPrimitive实例
         */
        setClassificationPrimitive(classificationPrimitive){
            let threejsProperty = this.threejsProperty;
            if(classificationPrimitive && !(classificationPrimitive instanceof ClassificationPrimitive)){
                throw new Error('参数必须为ClassificationPrimitive类型');
            }
            this.classificationPrimitive = classificationPrimitive;
            if(classificationPrimitive != null){
                if(!threejsProperty.classificationPrimitives.includes(classificationPrimitive)){
                    threejsProperty.classificationPrimitives.push(classificationPrimitive);
                }
            }
            this.cameraSync.updateCamera();
        }

    }

    exports.Mapbox3DTilesLayer = Mapbox3DTilesLayer;

    return exports;

}({}));
//# sourceMappingURL=Mapbox3DTiles.js.map
export {Mapbox3DTiles}
