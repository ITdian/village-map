import {
	Clock,
	Color,
	LinearEncoding,
	Matrix4,
	Mesh,
	RepeatWrapping,
	ShaderMaterial,
	TextureLoader,
	UniformsLib,
	UniformsUtils,
	Vector2,
	Vector3,
	Vector4
} from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import * as THREE from "three";
import _ from "lodash";
import CoorTransformUtils from "../utils/CoorTransformUtils";
const coorTransformUtils = new CoorTransformUtils();

/**
 * References:
 *	http://www.valvesoftware.com/publications/2010/siggraph2010_vlachos_waterflow.pdf
 * 	http://graphicsrunner.blogspot.de/2010/08/water-using-flow-maps.html
 *
 */

class Water extends Mesh {

	constructor( geometry, options = {} ) {

		super( geometry );

		this.type = 'Water';

		const scope = this;

		const color = ( options.color !== undefined ) ? new Color( options.color ) : new Color( 0xFFFFFF );
		const lightColor = ( options.color !== undefined ) ? new Color( options.color ) : new Color( 0xFFFFFF );
		const textureWidth = options.textureWidth || 512;
		const textureHeight = options.textureHeight || 512;
		const clipBias = options.clipBias || 0;
		const flowDirection = options.flowDirection || new Vector2( 1, 0 );
		const flowSpeed = options.flowSpeed || 0.03;
		const reflectivity = options.reflectivity || 0.02;
		const scale = options.scale || 1;
		const shader = options.shader || Water.WaterShader;
		const encoding = options.encoding !== undefined ? options.encoding : LinearEncoding;

		const textureLoader = new TextureLoader();

		const flowMap = options.flowMap || undefined;
		const normalMap0 = options.normalMap0 || textureLoader.load( '/img/Water_1_M_Normal.jpg' );
		const normalMap1 = options.normalMap1 || textureLoader.load( '/img/Water_2_M_Normal.jpg' );

		//是否根据地形设置水面依附
		const stickTerrain = options.stickTerrain || false;
		const mapboxMap = options.map || null;
		let lastTime = new Date().getTime();
		let intervalTime = 2000;

		const cycle = 0.15; // a cycle of a flow map phase
		const halfCycle = cycle * 0.5;
		const textureMatrix = new Matrix4();
		const clock = new Clock();

		// internal components

		if ( Reflector === undefined ) {

			console.error( 'THREE.Water: Required component Reflector not found.' );
			return;

		}

		const reflector = new Reflector( geometry, {
			textureWidth: textureWidth,
			textureHeight: textureHeight,
			clipBias: clipBias,
			encoding: encoding
		} );

		reflector.matrixAutoUpdate = false;

		// material

		this.material = new ShaderMaterial( {
			uniforms: UniformsUtils.merge( [
				UniformsLib[ 'fog' ],
				shader.uniforms
			] ),
			vertexShader: shader.vertexShader,
			fragmentShader: shader.fragmentShader,
			transparent: true,
			fog: true
		} );

		if ( flowMap !== undefined ) {

			this.material.defines.USE_FLOWMAP = '';
			this.material.uniforms[ 'tFlowMap' ] = {
				type: 't',
				value: flowMap
			};

		} else {

			this.material.uniforms[ 'flowDirection' ] = {
				type: 'v2',
				value: flowDirection
			};

		}

		// maps

		normalMap0.wrapS = normalMap0.wrapT = RepeatWrapping;
		normalMap1.wrapS = normalMap1.wrapT = RepeatWrapping;

		this.material.uniforms[ 'tReflectionMap' ].value = reflector.getRenderTarget().texture;
		this.material.uniforms[ 'tNormalMap0' ].value = normalMap0;
		this.material.uniforms[ 'tNormalMap1' ].value = normalMap1;

		// water

		this.material.uniforms[ 'color' ].value = color;
		this.material.uniforms[ 'lightColor' ].value = lightColor;
		this.material.uniforms[ 'reflectivity' ].value = reflectivity;
		this.material.uniforms[ 'textureMatrix' ].value = textureMatrix;

		// inital values

		this.material.uniforms[ 'config' ].value.x = 0; // flowMapOffset0
		this.material.uniforms[ 'config' ].value.y = halfCycle; // flowMapOffset1
		this.material.uniforms[ 'config' ].value.z = halfCycle; // halfCycle
		this.material.uniforms[ 'config' ].value.w = scale; // scale

		// functions

		function updateTextureMatrix( camera ) {

			textureMatrix.set(
				0.5, 0.0, 0.0, 0.5,
				0.0, 0.5, 0.0, 0.5,
				0.0, 0.0, 0.5, 0.5,
				0.0, 0.0, 0.0, 1.0
			);

			textureMatrix.multiply( camera.projectionMatrix );
			textureMatrix.multiply( camera.matrixWorldInverse );
			textureMatrix.multiply( scope.matrixWorld );

		}

		function updateFlow() {

			const delta = clock.getDelta();
			const config = scope.material.uniforms[ 'config' ];

			config.value.x += flowSpeed * delta; // flowMapOffset0
			config.value.y = config.value.x + halfCycle; // flowMapOffset1

			// Important: The distance between offsets should be always the value of "halfCycle".
			// Moreover, both offsets should be in the range of [ 0, cycle ].
			// This approach ensures a smooth water flow and avoids "reset" effects.

			if ( config.value.x >= cycle ) {

				config.value.x = 0;
				config.value.y = halfCycle;

			} else if ( config.value.y >= cycle ) {

				config.value.y = config.value.y - cycle;

			}

		}

		//

		this.onBeforeRender = function ( renderer, scene, camera ) {
			//修改水面依附到地形
			if(mapboxMap && stickTerrain){
				if(mapboxMap.getTerrain()){
					// 定时设置水面依附到地面
					let currentTime = new Date().getTime();
					if(currentTime - lastTime >= intervalTime){
						lastTime = currentTime;
						// 计算水面依附到地面
						// newBufferGeometry();
						let oldGeometry = this.geometry;
						let vertices = oldGeometry.attributes.position.array;
						let parent = this.parent;
						let originPosition = new Vector3().setFromMatrixPosition(parent.matrixWorld);
						let originHeight = originPosition.y;
						//循环获取点位的高度
						for(let i = 0; i < vertices.length; i += 3){
							let x = vertices[i];
							let y = vertices[i + 1];
							let localPostion = new Vector3(x, 0, -y);
							let pointPosition = new Vector3().addVectors(originPosition, localPostion);
							let lnglat = coorTransformUtils.threeWorldToWgs84(pointPosition);
							let elevation = mapboxMap.queryTerrainElevation([lnglat.lng, lnglat.lat], { exaggerated: false });
							if(elevation){
								vertices[i + 2] = elevation - originHeight + 0.1;
							}
						}

						let newGeometry = newBufferGeometry(vertices, oldGeometry.attributes.uv.array, oldGeometry.index.array, oldGeometry.attributes.normal.array);
						this.geometry = newGeometry;
					}
				}
			}

			updateTextureMatrix( camera );
			updateFlow();

			scope.visible = false;

			reflector.matrixWorld.copy( scope.matrixWorld );

			reflector.onBeforeRender( renderer, scene, camera );

			scope.visible = true;

		};


		/**
		 * 构建默认BufferGeometry几何体, !!!注意如果不是忽略Y轴的几何体，请自行传入indexes!!!
		 * @param vertices
		 * @param uvs
		 * @param indexes
		 * @param normal
		 * @returns {BufferGeometry}
		 */
		function newBufferGeometry(vertices, uvs, indexes, normal) {

			let geometry = new THREE.BufferGeometry();
			geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

			if(vertices.length > 3){
				geometry.index = new THREE.BufferAttribute(indexes, 1);
				geometry.attributes.uv = new THREE.BufferAttribute(uvs, 2);
				geometry.setAttribute('normal', normal || indexes ? normalWithIndex(vertices, indexes) : defNormal(vertices));
			}
			geometry.setAttribute('normal', normal || indexes ? normalWithIndex(vertices, indexes) : defNormal(vertices));

			geometry.computeBoundingBox();
			return geometry;


			function normalWithIndex(vertices, indexes) {
				const buffer = [];
				const indexGroup = _.chunk(indexes, 3);

				const normal = new THREE.Vector3(0, 0, -1);
				for (const item of indexGroup) {
					const p1 = new THREE.Vector3().fromArray(vertices, item[0] * 3);
					const p2 = new THREE.Vector3().fromArray(vertices, item[1] * 3);
					const p3 = new THREE.Vector3().fromArray(vertices, item[2] * 3);
					THREE.Triangle.getNormal(p1, p2, p3, normal);
					let i = 0;
					while (i < 3) {
						buffer.push(...normal.toArray());
						i++;
					}

				}

				return new THREE.Float32BufferAttribute(buffer, 3);
			}

			function defNormal(vertices) {
				let normal = new THREE.Vector3(0, 0, -1);

				if (vertices.length >= 9) {
					const p1 = new THREE.Vector3(vertices[0], vertices[1], vertices[2]);
					const p2 = new THREE.Vector3(vertices[3], vertices[4], vertices[5]);
					const p3 = new THREE.Vector3(vertices[6], vertices[7], vertices[8]);
					THREE.Triangle.getNormal(p1, p2, p3, normal);
				}

				const buffer = [];
				for (let i = 0; i < vertices.length; i += 3) {
					//buffer.push(...new THREE.Vector3().fromArray(vertices, i).normalize().toArray())
					buffer.push(...normal.toArray());
				}
				return new THREE.Float32BufferAttribute(buffer, 3);
			}
		}

	}

}

Water.prototype.isWater = true;

Water.WaterShader = {

	uniforms: {

		'color': {
			type: 'c',
			value: null
		},

		'lightColor': {
			type: 'c',
			value: null
		},

		'reflectivity': {
			type: 'f',
			value: 0
		},

		'tReflectionMap': {
			type: 't',
			value: null
		},

		'tNormalMap0': {
			type: 't',
			value: null
		},

		'tNormalMap1': {
			type: 't',
			value: null
		},

		'textureMatrix': {
			type: 'm4',
			value: null
		},

		'config': {
			type: 'v4',
			value: new Vector4()
		}

	},

	vertexShader: /* glsl */`

		#include <common>
		#include <fog_pars_vertex>
		#include <logdepthbuf_pars_vertex>

		uniform mat4 textureMatrix;

		varying vec4 vCoord;
		varying vec2 vUv;
		varying vec3 vToEye;

		void main() {

			vUv = uv;
			vCoord = textureMatrix * vec4( position, 1.0 );

			vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
			vToEye = cameraPosition - worldPosition.xyz;
			vToEye = vec3(vToEye.x, vToEye.y, vToEye.z);

			vec4 mvPosition =  viewMatrix * worldPosition; // used in fog_vertex
			gl_Position = projectionMatrix * mvPosition;

			#include <logdepthbuf_vertex>
			#include <fog_vertex>

		}`,

	fragmentShader: /* glsl */`

		#include <common>
		#include <fog_pars_fragment>
		#include <logdepthbuf_pars_fragment>

		uniform sampler2D tReflectionMap;
		uniform sampler2D tNormalMap0;
		uniform sampler2D tNormalMap1;

		#ifdef USE_FLOWMAP
			uniform sampler2D tFlowMap;
		#else
			uniform vec2 flowDirection;
		#endif

		uniform vec3 color;
		uniform vec3 lightColor;
		uniform float reflectivity;
		uniform vec4 config;

		varying vec4 vCoord;
		varying vec2 vUv;
		varying vec3 vToEye;

		void main() {

			#include <logdepthbuf_fragment>

			float flowMapOffset0 = config.x;
			float flowMapOffset1 = config.y;
			float halfCycle = config.z;
			float scale = config.w;

			vec3 toEye = normalize( vToEye );

			// determine flow direction
			vec2 flow;
			#ifdef USE_FLOWMAP
				flow = texture2D( tFlowMap, vUv ).rg * 2.0 - 1.0;
			#else
				flow = flowDirection;
			#endif
			flow.x *= - 1.0;

			// sample normal maps (distort uvs with flowdata)
			vec4 normalColor0 = texture2D( tNormalMap0, ( vUv * scale ) + flow * flowMapOffset0 );
			vec4 normalColor1 = texture2D( tNormalMap1, ( vUv * scale ) + flow * flowMapOffset1 );

			// linear interpolate to get the final normal color
			float flowLerp = abs( halfCycle - flowMapOffset0 ) / halfCycle;
			vec4 normalColor = mix( normalColor0, normalColor1, flowLerp );

			// calculate normal vector
			vec3 normal = normalize( vec3( normalColor.r * 2.0 - 1.0, normalColor.b,  normalColor.g * 2.0 - 1.0 ) );

			// calculate the fresnel term to blend reflection and refraction maps
			float theta = max( abs(dot( toEye, normal )), 0.0 );
			if(theta > 0.9){
				theta = theta / 1.8;
			} else if(theta < 0.2){
				theta = theta * 2.0;
			}
			
			float reflectance = reflectivity + ( 1.0 - reflectivity ) * pow( ( 1.0 - theta ), 5.0 );

			// calculate final uv coords
			vec3 coord = vCoord.xyz / vCoord.w;
			vec2 uv = coord.xy + coord.z * normal.xz * 0.05;

			float refxishu = reflectance / 2.;
			vec4 reflectColor = texture2D( tReflectionMap, vec2( 1.0 - uv.x, uv.y ) );
			if(reflectColor.x <= 0.2 && reflectColor.y <= 0.2 && reflectColor.z <= 0.2){
				reflectColor = vec4(color.x * 0.4 + reflectance, color.y * 0.6 + reflectance, color.z * 0.8 + reflectance, 0.7);
			}
			vec4 refractColor = vec4(color.x + refxishu, color.y + refxishu, color.z + refxishu, 0.9);

			// multiply water color with the mix of both textures
			vec4 colorend = vec4( color, 1.0 ) * mix( reflectColor, refractColor, reflectance );
			
			// 计算波光粼粼效果
			float boguangXishu = reflectance / 50.0;
			vec4 boguangColor = vec4(lightColor, 1.);
			colorend = mix(colorend, boguangColor, boguangXishu);
			
			gl_FragColor = colorend;

			#include <tonemapping_fragment>
			#include <encodings_fragment>
			#include <fog_fragment>

		}`

};

export { Water };
