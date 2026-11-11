// Port of de.lardtom.propwash.sim.MoveReport (1:1).

export class MoveReport {
  requestedX = 0.0;
  requestedY = 0.0;
  requestedZ = 0.0;
  actualX = 0.0;
  actualY = 0.0;
  actualZ = 0.0;
  hitX = false;
  hitY = false;
  hitZ = false;
  impactVelocityX = NaN;
  impactVelocityY = NaN;
  impactVelocityZ = NaN;
  surfaceGrip = 1.0;
  surfaceRestitution = -1.0;
  supportGap = NaN;
  contactNormalX = NaN;
  contactNormalY = NaN;
  contactNormalZ = NaN;

  clear() {
    this.requestedX = 0.0;
    this.requestedY = 0.0;
    this.requestedZ = 0.0;
    this.actualX = 0.0;
    this.actualY = 0.0;
    this.actualZ = 0.0;
    this.hitX = false;
    this.hitY = false;
    this.hitZ = false;
    this.impactVelocityX = NaN;
    this.impactVelocityY = NaN;
    this.impactVelocityZ = NaN;
    this.surfaceGrip = 1.0;
    this.surfaceRestitution = -1.0;
    this.supportGap = NaN;
    this.contactNormalX = NaN;
    this.contactNormalY = NaN;
    this.contactNormalZ = NaN;
  }

  obliqueContact() {
    return Number.isFinite(this.contactNormalX) && Number.isFinite(this.contactNormalY) && Number.isFinite(this.contactNormalZ);
  }
}
