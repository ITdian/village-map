/**
 * 雷达特效
 * @author lidy
 * @since 2022-03-14
 * 与使用Mesh相似，不再需要设置纹理
 */
import * as THREE from 'three';

class RadarMesh extends THREE.Mesh {

    constructor(geometry, options = {}) {
        super( geometry );

        this.type = 'RadarMesh';

        const scope = this;

        const color = ( options.color !== undefined ) ? new THREE.Color( options.color ) : new THREE.Color( 0xFF0000 );
        const speed = ( options.speed !== undefined ) ? options.speed : 3;
        const shader = options.shader || RadarMesh.RadarShader;
        const dateTime = new Date().getTime();

        this.material = new THREE.ShaderMaterial( {
            uniforms: shader.uniforms,
            vertexShader: shader.vertexShader,
            fragmentShader: shader.fragmentShader,
            transparent: true,
            opacity: 0.6,
            depthTest: false,
            depthWrite: false
        } );

        this.material.uniforms[ 'color' ].value = color;

        this.onBeforeRender = function ( renderer, scene, camera ) {
            let dateTime1 = new Date().getTime();
            let pastTime = (dateTime1 - dateTime) / 1000;
            let timeParams = (pastTime % speed) / speed;
            scope.material.uniforms[ 'timeParam' ].value = timeParams;
        };
    }
}
RadarMesh.prototype.isRadar = true;

RadarMesh.RadarShader = {

    uniforms: {

        'color': {
            type: 'c',
            value: null
        },
        'timeParam': {
            type: 'f',
            value: 0
        },
        'rangeParam': {
            type: 'f',
            value: 0.3
        }

    },

    vertexShader: /* glsl */`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			
			vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
			vec4 mvPosition =  viewMatrix * worldPosition; // used in fog_vertex
			gl_Position = projectionMatrix * mvPosition;

		}`,

    fragmentShader: /* glsl */`

		uniform vec3 color;
		uniform float timeParam;
		uniform float rangeParam;
		varying vec2 vUv;
		
		void main() {
		    float beishu = 1.0 / rangeParam;
		
		    float len1 = distance(vUv, vec2(0.5, 0.5)) * 2.0;
		    float param1 = len1 - timeParam;
		    if(param1 >= 0.0 &&param1 < rangeParam){
			    gl_FragColor = vec4(color, param1 * beishu);
			}else if(param1 < 0.0){
			    param1 += 1.0;
			    if(param1 >= 0.0 &&param1 < rangeParam){
			        gl_FragColor = vec4(color, param1 * beishu);
			    }
		    }else{
		        discard;
            }
			
		}`

};


export { RadarMesh };
