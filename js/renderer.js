"use strict";
var Reflection = Reflection || {
  ambient: new Pixel(0, 0, 0),
  diffuse: new Pixel(1.0, 1.0, 1.0),
  specular: new Pixel(1.0, 1.0, 1.0),
  shininess: 20,
};


Reflection.phongReflectionModel = function(vertex, view, normal, lightPos, phongMaterial) {
  var color = new Pixel(0, 0, 0);
  normal.normalize();

  // diffuse
  var light_dir = (new THREE.Vector3()).subVectors(lightPos, vertex).normalize();
  var ndotl = normal.dot(light_dir);
  color.plus(phongMaterial.diffuse.copy().multipliedBy(ndotl));

  // ----------- STUDENT CODE BEGIN ------------
  // ----------- Our reference solution uses 9 lines of code.

  // ambient
  color.plus(phongMaterial.ambient);

  // specular
  var r = light_dir.multiplyScalar(-1).reflect(normal);
  var v = (new THREE.Vector3()).subVectors(view, vertex).normalize();
  var vdotr = Math.pow(Math.max(0, v.dot(r)), phongMaterial.shininess);
  color.plus(phongMaterial.specular.copy().multipliedBy(vdotr));
  // ----------- STUDENT CODE END ------------

  return color;
}

var Renderer = Renderer || {
  meshInstances: new Set(),
  width: 320,
  height: 240,
  negNear: 0.3,
  negFar: 1000,
  fov: 45,
  lightPos: new THREE.Vector3(10, 10, -10),
  shaderMode: "",
  cameraLookAtVector: new THREE.Vector3(0, 0, 0),
  cameraPosition: new THREE.Vector3(0, 0, -10),
  cameraUpVector: new THREE.Vector3(0, -1, 0),
  cameraUpdated: true
};

Renderer.updateCameraParameters = function() {
  this.camera.position.copy(this.cameraPosition);
  this.camera.up.copy(this.cameraUpVector);
  this.camera.lookAt(this.cameraLookAtVector);
};


Renderer.initialize = function() {
  this.buffer = new Image(this.width, this.height);
  this.zBuffer = [];

  // set camera
  this.camera = new THREE.PerspectiveCamera(this.fov, this.width / this.height, this.negNear, this.negFar);
  this.updateCameraParameters();

  this.clearZBuffer();
  this.buffer.display(); // initialize canvas
};

Renderer.clearZBuffer = function() {
  for (var x = 0; x < this.width; x++) {
    this.zBuffer[x] = new Float32Array(this.height);
    for (var y = 0; y < this.height; y++) {
      this.zBuffer[x][y] = 1; // z value is in [-1 1];
    }
  }
};

Renderer.addMeshInstance = function(meshInstance) {
  assert(meshInstance.mesh, "meshInstance must have mesh to be added to renderer");
  this.meshInstances.add(meshInstance);
};

Renderer.removeMeshInstance = function(meshInstance) {
  this.meshInstances.delete(meshInstance);
};

Renderer.clear = function() {
  this.buffer.clear();
  this.clearZBuffer();
  Main.context.clearRect(0, 0, Main.canvas.width, Main.canvas.height);
};

Renderer.displayImage = function() {
  this.buffer.display();
};

Renderer.render = function() {
  this.clear();

  var eps = 0.01;
  if (!(this.cameraUpVector.distanceTo(this.camera.up) < eps &&
      this.cameraPosition.distanceTo(this.camera.position) < eps &&
      this.cameraLookAtVector.distanceTo(Main.controls.target) < eps)) {
    this.cameraUpdated = false;
    // update camera position
    this.cameraLookAtVector.copy(Main.controls.target);
    this.cameraPosition.copy(this.camera.position);
    this.cameraUpVector.copy(this.camera.up);
  } else { // camera's stable, update url once
    if (!this.cameraUpdated) {
      Gui.updateUrl();
      this.cameraUpdated = true; //update one time
    }
  }

  this.camera.updateMatrixWorld();
  this.camera.matrixWorldInverse.getInverse(this.camera.matrixWorld);

  // light goes with the camera, COMMENT this line for debugging if you want
  this.lightPos = this.camera.position;

  for (var meshInst of this.meshInstances) {
    var mesh = meshInst.mesh;
    if (mesh !== undefined) {
      for (var faceIdx = 0; faceIdx < mesh.faces.length; faceIdx++) {
        var face = mesh.faces[faceIdx];
        var verts = [mesh.vertices[face.a], mesh.vertices[face.b], mesh.vertices[face.c]];
        var vert_normals = [mesh.vertex_normals[face.a], mesh.vertex_normals[face.b], mesh.vertex_normals[face.c]];

        // camera's view matrix = K * [R | t] where K is the projection matrix and [R | t] is the inverse of the camera pose
        var viewMat = (new THREE.Matrix4()).multiplyMatrices(this.camera.projectionMatrix,
          this.camera.matrixWorldInverse);

        Renderer.drawTriangle(verts, vert_normals, mesh.uvs[faceIdx], meshInst.material, viewMat);
      }
    }
  }

  this.displayImage();
};

Renderer.getPhongMaterial = function(uv_here, material) {
  var phongMaterial = {};
  phongMaterial.ambient = Reflection.ambient;

  if (material.diffuse === undefined || uv_here === undefined) {
    phongMaterial.diffuse = Reflection.diffuse;
  } else if (Pixel.prototype.isPrototypeOf(material.diffuse)) {
    phongMaterial.diffuse = material.diffuse;
  } else {
    // note that this function uses point sampling. it would be better to use bilinear
    // subsampling and mipmaps for area sampling, but this good enough for now...
    phongMaterial.diffuse = material.diffuse.getPixel(Math.floor(uv_here.x * (material.diffuse.width-1)),
      Math.floor(uv_here.y * (material.diffuse.height-1)));
  }

  if (material.specular === undefined || uv_here === undefined) {
    phongMaterial.specular = Reflection.specular;
  } else if (Pixel.prototype.isPrototypeOf(material.specular)) {
    phongMaterial.specular = material.specular;
  } else {
    phongMaterial.specular = material.specular.getPixel(Math.floor(uv_here.x * (material.specular.width-1)),
      Math.floor(uv_here.y * (material.specular.height-1)));
  }

  phongMaterial.shininess = Reflection.shininess;

  return phongMaterial;
};

Renderer.projectVerticesNaive = function(verts) {
  // this is a naive orthogonal projection, does not even consider camera pose
  var projectedVerts = [];

  var orthogonalScale = 5;
  for (var i = 0; i < 3; i++) {
    projectedVerts[i] = new THREE.Vector4(verts[i].x, verts[i].y, verts[i].z, 1.0);

    projectedVerts[i].x /= orthogonalScale;
    projectedVerts[i].y /= orthogonalScale * this.height / this.width;

    projectedVerts[i].x = projectedVerts[i].x * this.width / 2 + this.width / 2;
    projectedVerts[i].y = projectedVerts[i].y * this.height / 2 + this.height / 2;
  }

  return projectedVerts;
};


Renderer.projectVertices = function(verts, viewMat) {
  var projectedVerts = []; // Vector3/Vector4 array (you need z for z buffering)
	
	var counter = 0; // counter for z-checking
	
	for (var i = 0; i < verts.length; i++) { // length should always be 3?
		projectedVerts[i] = new THREE.Vector4(verts[i].x, verts[i].y, verts[i].z, 1.0);
		projectedVerts[i].applyMatrix4(viewMat); // apply viewMat
		
		// normalize
		projectedVerts[i].x = projectedVerts[i].x / projectedVerts[i].w;
		projectedVerts[i].y = projectedVerts[i].y / projectedVerts[i].w;
		projectedVerts[i].z = projectedVerts[i].z / projectedVerts[i].w;
		
		// scale
    projectedVerts[i].x = projectedVerts[i].x * this.width / 2 + this.width / 2;
    projectedVerts[i].y = projectedVerts[i].y * this.height / 2 + this.height / 2;
		
		// z-check
		if (!(projectedVerts[i].w > this.negNear && projectedVerts[i].w < this.negFar)) {
			counter += 1
		}
	}

	if (counter == 3) projectedVerts = undefined; // skip if all vertices are out-of-bounds

  // ----------- STUDENT CODE BEGIN ------------
  // ----------- Our reference solution uses 12 lines of code.
  // ----------- STUDENT CODE END ------------

  return projectedVerts;
};

Renderer.computeBoundingBox = function(projectedVerts) {
  var box = {};
  box.minX = -1;
  box.minY = -1;
  box.maxX = -1;
  box.maxY = -1;
	
	// set mins to first vertex for later comparison
	// (need to round to use as pixel values, from Piazza) 
	box.minX = Math.floor(projectedVerts[0].x);
	box.minY = Math.floor(projectedVerts[0].y);
	
	for (var i = 0; i < projectedVerts.length; i++) {
		// max
		if (projectedVerts[i].x > box.maxX) box.maxX = Math.ceil(projectedVerts[i].x);
		if (projectedVerts[i].y > box.maxY) box.maxY = Math.ceil(projectedVerts[i].y);
		// min                                                                       
		if (projectedVerts[i].x < box.minX) box.minX = Math.floor(projectedVerts[i].x);
		if (projectedVerts[i].y < box.minY) box.minY = Math.floor(projectedVerts[i].y);
	}
	
  // ----------- STUDENT CODE BEGIN ------------
  // ----------- Our reference solution uses 14 lines of code.
  // ----------- STUDENT CODE END ------------

  return box;
};

Renderer.computeBarycentric = function(projectedVerts, x, y) {
  var triCoords = [];
  // (see https://fgiesen.wordpress.com/2013/02/06/the-barycentric-conspirac/)
  // return undefined if (x,y) is outside the triangle
  // ----------- STUDENT CODE BEGIN ------------
  // ----------- Our reference solution uses 15 lines of code.
  var v0x = projectedVerts[0].x;
  var v0y = projectedVerts[0].y;
  var v1x = projectedVerts[1].x;
  var v1y = projectedVerts[1].y;
  var v2x = projectedVerts[2].x;
  var v2y = projectedVerts[2].y;	

  var f01 = (v0y-v1y)*x + (v1x-v0x)*y + (v0x*v1y - v0y*v1x);
  var f12 = (v1y-v2y)*x + (v2x-v1x)*y + (v1x*v2y - v1y*v2x);
  var f20 = (v2y-v0y)*x + (v0x-v2x)*y + (v2x*v0y - v2y*v0x);
  var area = f01 + f12 + f20;
  if (f01 < 0 || f12 < 0 || f20 < 0) return undefined;

  triCoords = new THREE.Vector3(f12/area, f20/area, f01/area);

  // ----------- STUDENT CODE END ------------
  return triCoords;
};

Renderer.drawTriangleWire = function(projectedVerts) {
  var color = new Pixel(1.0, 0, 0);
  for (var i = 0; i < 3; i++) {
    var va = projectedVerts[(i + 1) % 3];
    var vb = projectedVerts[(i + 2) % 3];

    var ba = new THREE.Vector2(vb.x - va.x, vb.y - va.y);
    var len_ab = ba.length();
    ba.normalize();
    // draw line
    for (var j = 0; j < len_ab; j += 0.5) {
      var x = Math.round(va.x + ba.x * j);
      var y = Math.round(va.y + ba.y * j);
      this.buffer.setPixel(x, y, color);
    }
  }
};

Renderer.setPixel = function(x, y, color) {
  this.buffer.setPixel(x, y, color)
};

// Renderer.scanTriangle = function(verts, color) {
//   var box = this.computeBoundingBox(verts);
//   for (var i = box.minX; i < box.maxX; i++) {
//     for (var j = box.minY; j < box.maxY; j++) {
//       if (this.computeBarycentric(verts, i, j) != undefined) this.setPixel(i, j, color);
//     }
//   }
// };

Renderer.drawTriangleFlat = function(verts, projectedVerts, normals, uvs, material) {
	
	// initialize sums for average
	var sumNormals = new THREE.Vector3();
	var sumVertices = new THREE.Vector3();
	
	// sum for averages
	for (var i = 0; i < verts.length; i++) {
		sumNormals.add(normals[i]);
		sumVertices.add(verts[i]);
	}
	
	// get averages
	var faceNormal = sumNormals.divideScalar(verts.length);
	var faceCentroid = sumVertices.divideScalar(verts.length);
	
	// faster outside if uvs aren't changing (undefined)
	if (uvs === undefined) {
		var phongMaterial = this.getPhongMaterial(uvs, material);
		// use to get color
		var color = Reflection.phongReflectionModel(faceCentroid, this.cameraPosition, faceNormal, this.lightPos, phongMaterial)
	}
	
	// adapted from scanTriangle to add zBuffer stuff
  var box = this.computeBoundingBox(projectedVerts);
  for (var i = Math.max(0, box.minX); i < box.maxX; i++) { // ensure within frame
		if (i > this.width - 1) break; // ensure within frame
    for (var j = Math.max(0, box.minY); j < box.maxY; j++) { // ensure within frame
			if (j > this.height - 1) break; // ensure within frame
			
			var bary = this.computeBarycentric(projectedVerts, i, j)
			
			if (bary !== undefined) { // only care if point in triangle
				// check z'/w (already did /w in the projection, so commented out)
				var zPrime = projectedVerts[0].z * bary.x + projectedVerts[1].z * bary.y + projectedVerts[2].z * bary.z;
				// var w = projectedVerts[0].w * bary.x + projectedVerts[1].w * bary.y + projectedVerts[2].w * bary.z;
								
				if (zPrime < this.zBuffer[i][j]) { // only worth doing things if passes
					// interpolate uvs
					if (uvs !== undefined) {
						var newUVs = new THREE.Vector2(uvs[0].x * bary.x + uvs[1].x * bary.y + uvs[2].x * bary.z,
							uvs[0].y * bary.x + uvs[1].y * bary.y + uvs[2].y * bary.z);
						var phongMaterial = this.getPhongMaterial(newUVs, material);
						var color = Reflection.phongReflectionModel(faceCentroid, this.cameraPosition, faceNormal, this.lightPos, phongMaterial)
					}
					this.setPixel(i, j, color);
					this.zBuffer[i][j] = zPrime; // set new zBuffer minimum
				}
			}
		}
	}
	
	// this.scanTriangle(projectedVerts, color);
	
  // ----------- STUDENT CODE BEGIN ------------
  // ----------- Our reference solution uses 45 lines of code.
  // ----------- STUDENT CODE END ------------
};


Renderer.drawTriangleGouraud = function(verts, projectedVerts, normals, uvs, material) {
  // ----------- STUDENT CODE BEGIN ------------
  // ----------- Our reference solution uses 42 lines of code.

	// faster outside if uvs aren't changing (undefined)
	if (uvs === undefined) {
		var phongMaterial = this.getPhongMaterial(uvs, material);

	  // calculate colors at each vertex using Phong Reflection Model
	  var colors = [];
	  for (var k = 0; k < verts.length; k++) // using k because porting the function into triangle scan later
	    colors[k] = Reflection.phongReflectionModel(verts[k], this.cameraPosition, normals[k], this.lightPos, phongMaterial);
	}

  // Interpolate using barycentric coordinates for each pixel within triangle
  var box = this.computeBoundingBox(projectedVerts);
  for (var i = Math.max(0, box.minX); i < box.maxX; i++) { 
		if (i > this.width - 1) break;
    for (var j = Math.max(0, box.minY); j < box.maxY; j++) {
			if (j > this.height - 1) break;
			
			var bary = this.computeBarycentric(projectedVerts, i, j);
			
      if (bary !== undefined) {
				var zPrime = projectedVerts[0].z * bary.x + projectedVerts[1].z * bary.y + projectedVerts[2].z * bary.z;			
					
				if (zPrime < this.zBuffer[i][j]) {
					// interpolate uvs
					if (uvs !== undefined) {
						var newUVs = new THREE.Vector2(uvs[0].x * bary.x + uvs[1].x * bary.y + uvs[2].x * bary.z,
							uvs[0].y * bary.x + uvs[1].y * bary.y + uvs[2].y * bary.z);
						var phongMaterial = this.getPhongMaterial(newUVs, material);
					  var colors = [];
					  for (var k = 0; k < verts.length; k++)
					    colors[k] = Reflection.phongReflectionModel(verts[k], this.cameraPosition, normals[k], this.lightPos, phongMaterial);
					}
					
					// interpolate color using vertices
					var newColor = colors[0].copyMultiplyScalar(bary.x);
					newColor.plus(colors[1].copyMultiplyScalar(bary.y));
					newColor.plus(colors[2].copyMultiplyScalar(bary.z));
					
					this.setPixel(i, j, newColor);
					this.zBuffer[i][j] = zPrime;
				}
      }
    }
  }

  // ----------- STUDENT CODE END ------------
};


Renderer.drawTrianglePhong = function(verts, projectedVerts, normals, uvs, material) {
  // ----------- STUDENT CODE BEGIN ------------
	
	// faster outside if uvs aren't changing (undefined)
	if (uvs === undefined) {
		var phongMaterial = this.getPhongMaterial(uvs, material);
	}

  var box = this.computeBoundingBox(projectedVerts);
  for (var i = Math.max(0, box.minX); i < box.maxX; i++) {
		if (i > this.width - 1) break;
    for (var j = Math.max(0, box.minY); j < box.maxY; j++) {
			if (j > this.height - 1) break;
			
			var bary = this.computeBarycentric(projectedVerts, i, j);
			
      if (bary !== undefined) {
				var zPrime = projectedVerts[0].z * bary.x + projectedVerts[1].z * bary.y + projectedVerts[2].z * bary.z;
				
				if (zPrime < this.zBuffer[i][j]) {
					var temp = new THREE.Vector3(); // for holding copies of values
					
					// interpolate vertex
					var newVert = new THREE.Vector3();
					newVert.add(temp.copy(verts[0]).multiplyScalar(bary.x));
					newVert.add(temp.copy(verts[1]).multiplyScalar(bary.y));
					newVert.add(temp.copy(verts[2]).multiplyScalar(bary.z));
					
					// interpolate UVs (https://www.gamedev.net/topic/593669-perspective-correct-barycentric-coordinates/)
					if (uvs !== undefined) {
						// var newUVs = new THREE.Vector2((uvs[0].x / projectedVerts[0].w) * bary.x + (uvs[1].x / projectedVerts[1].w) * bary.y + (uvs[2].x / projectedVerts[2].w) * bary.z,
						// (uvs[0].y / projectedVerts[0].w) * bary.x + (uvs[1].y / projectedVerts[1].w) * bary.y + (uvs[2].y / projectedVerts[2].w) * bary.z);
						// var wPrime = (1 / projectedVerts[0].w) * bary.x + (1 / projectedVerts[1].w) * bary.y + (1 / projectedVerts[2].w) * bary.z;
						// newUVs.divideScalar(wPrime);
						// commented code seems to do the same thing?
						var newUVs = new THREE.Vector2(uvs[0].x * bary.x + uvs[1].x * bary.y + uvs[2].x * bary.z,
							uvs[0].y * bary.x + uvs[1].y * bary.y + uvs[2].y * bary.z);
						
						// normal mapping	(normal doesn't need to be interpolated)
						var xyz = 0;
						
						var phongMaterial = this.getPhongMaterial(newUVs, material);
						var newColor = Reflection.phongReflectionModel(newVert, this.cameraPosition, xyz, this.lightPos, phongMaterial);
					}
					// if there are no UVs, there is no normal mapping to do, so normal needs to be interpolated
					else {
						// interpolate normal
						var newNormal = new THREE.Vector3();
						newNormal.add(temp.copy(normals[0]).multiplyScalar(bary.x));
						newNormal.add(temp.copy(normals[1]).multiplyScalar(bary.y));
						newNormal.add(temp.copy(normals[2]).multiplyScalar(bary.z));
						
						var newColor = Reflection.phongReflectionModel(newVert, this.cameraPosition, newNormal, this.lightPos, phongMaterial);
					}
					
					// var xyz = new THREE.Vector3(newColor.r, newColor.g, newColor.b);
					// xyz.multiplyScalar(2);
					// // .subScalar() doesn't work for some reason...
					// xyz.x -= 1;
					// xyz.y -= 1;
					// xyz.z -= 1;
										
					this.setPixel(i, j, newColor);
					this.zBuffer[i][j] = zPrime;
				}
      }
    }
  }
	
	
  // ----------- Our reference solution uses 53 lines of code.	
  // ----------- STUDENT CODE END ------------
};


Renderer.drawTriangle = function(verts, normals, uvs, material, viewMat) {

  var projectedVerts = this.projectVertices(verts, viewMat);
  if (projectedVerts === undefined) { // not within near and far plane
    return;
  } else if (projectedVerts.length <= 0){
    projectedVerts = this.projectVerticesNaive(verts);
  }

  switch (this.shaderMode) {
    case "Wire":
      this.drawTriangleWire(projectedVerts);
      break;
    case "Flat":
      this.drawTriangleFlat(verts, projectedVerts, normals, uvs, material);
      break;
    case "Gouraud":
      this.drawTriangleGouraud(verts, projectedVerts, normals, uvs, material);
      break;
    case "Phong":
      this.drawTrianglePhong(verts, projectedVerts, normals, uvs, material);
      break;
    default:
  }
};
