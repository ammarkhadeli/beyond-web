import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math';

/** A visual chase camera in the vehicle frame. The target bearing can rotate
 * through any axis as orbital attitude changes; neither body is repositioned. */
export function stationApproachCamera(targetPosition:Vector3,yaw=0,pitch=0){
  const craftCenter=new Vector3(0,-3,0),bearing=targetPosition.subtract(craftCenter);
  if(bearing.lengthSquared()<1e-8)bearing.copyFrom(Vector3.Forward());
  bearing.normalize();
  // Minimal rotation keeps the offset basis continuous through the vertical
  // bearings that defeated a fixed, body-coordinate chase position.
  const alignment=Quaternion.FromUnitVectorsToRef(Vector3.Forward(),bearing,new Quaternion());
  const orbit=Quaternion.RotationYawPitchRoll(yaw,Math.max(-.6,Math.min(1.1,pitch)),0);
  const matrix=Matrix.Identity();alignment.multiply(orbit).toRotationMatrix(matrix);
  return {
    position:craftCenter.add(Vector3.TransformNormal(new Vector3(12,8,-32),matrix)),
    target:craftCenter.add(bearing.scale(4)),
  };
}
