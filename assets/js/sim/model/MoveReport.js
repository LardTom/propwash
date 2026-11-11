// Port of de.lardtom.propwash.sim.MoveReport (1:1).

export class MoveReport {
  static stickyBit(axis, positive) {
    return 1 << (axis * 2 + (positive ? 1 : 0));
  }

  static STICKY_FLOOR = MoveReport.stickyBit(1, false);
  static STICKY_ALL = 0x3F;

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
  surfaceImpactScale = 1.0;
  supportGap = NaN;
  contactNormalX = NaN;
  contactNormalY = NaN;
  contactNormalZ = NaN;
  ghost = false;
  stickySides = 0;

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
    this.surfaceImpactScale = 1.0;
    this.supportGap = NaN;
    this.contactNormalX = NaN;
    this.contactNormalY = NaN;
    this.contactNormalZ = NaN;
    this.ghost = false;
    this.stickySides = 0;
  }

  obliqueContact() {
    return Number.isFinite(this.contactNormalX) && Number.isFinite(this.contactNormalY) && Number.isFinite(this.contactNormalZ);
  }
}
