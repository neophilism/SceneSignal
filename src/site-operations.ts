import {canonicalJson,identifier,integer,invariant} from '@neophilism/distributed-audio-engine';
import {requireSceneRole} from './session.js';
import type {SceneActor,SceneSession} from './session.js';

export type SiteIncidentKind='WEATHER'|'ACCESS'|'MEDICAL'|'SAFETY';
export type SiteIncidentSeverity='ADVISORY'|'STOP';
export interface SiteIncident {
  incidentId:string;
  kind:SiteIncidentKind;
  severity:SiteIncidentSeverity;
  observedAtMs:number;
}
export interface SiteContactReference {
  role:'SITE_LEAD'|'ACCESS_STEWARD'|'MEDICAL_STEWARD'|'SAFETY_LEAD';
  /** Opaque reference to an independently protected owner contact record. */
  secureReferenceId:string;
}
const kinds=new Set<SiteIncidentKind>(['WEATHER','ACCESS','MEDICAL','SAFETY']);
const severities=new Set<SiteIncidentSeverity>(['ADVISORY','STOP']);
const roles=new Set<SiteContactReference['role']>(['SITE_LEAD','ACCESS_STEWARD','MEDICAL_STEWARD','SAFETY_LEAD']);

/** Private operator incident kernel. No weather API, public contact directory,
 * evacuation-routing claim, or authority to restart signed playback. */
export class SceneSiteOperations {
  private readonly scope:ReturnType<SceneSession['snapshot']>['scope'];
  private readonly siteRevision:number;
  private contacts:SiteContactReference[]=[];
  private readonly incidents=new Map<string,SiteIncident>();
  constructor(private readonly session:SceneSession){
    const snap=session.snapshot();
    this.scope=structuredClone(snap.scope);
    this.siteRevision=snap.plan.revision;
  }
  private current():void{
    const snap=this.session.snapshot();
    invariant(snap.plan.revision===this.siteRevision&&
      snap.state!=='cancelled'&&snap.state!=='stopped','SITE_OPERATIONS_NOT_CURRENT');
  }
  configureContacts(actor:SceneActor,contacts:SiteContactReference[],nowMs:number):void{
    requireSceneRole(actor,this.scope,['organizer'],nowMs);
    this.current();
    invariant(Array.isArray(contacts)&&contacts.length<=12,'INVALID_SITE_CONTACT_REFERENCES');
    const seen=new Set<SiteContactReference['role']>();
    for(const contact of contacts){
      invariant(contact&&typeof contact==='object'&&!Array.isArray(contact)&&
        Object.keys(contact).sort().join(',')==='role,secureReferenceId'&&
        roles.has(contact.role),'INVALID_SITE_CONTACT_REFERENCE');
      identifier(contact.secureReferenceId);
      invariant(!seen.has(contact.role),'DUPLICATE_SITE_CONTACT_ROLE');
      seen.add(contact.role);
    }
    this.contacts=structuredClone(contacts);
  }
  /** DANGEROUS/STOP incidents stop the underlying session output first.
   * Incident assertions are operator reports, never inferred sensor readings. */
  recordIncident(actor:SceneActor,incident:SiteIncident,nowMs:number):
    {duplicate:boolean;sessionStopped:boolean;fieldValidated:false}{
    requireSceneRole(actor,this.scope,['organizer','operator','steward'],nowMs);
    integer(nowMs);
    invariant(incident&&typeof incident==='object'&&!Array.isArray(incident)&&
      Object.keys(incident).sort().join(',')==='incidentId,kind,observedAtMs,severity',
      'INVALID_SITE_INCIDENT');
    identifier(incident.incidentId);
    invariant(kinds.has(incident.kind)&&severities.has(incident.severity),
      'INVALID_SITE_INCIDENT_CLASSIFICATION');
    integer(incident.observedAtMs);
    invariant(incident.observedAtMs<=nowMs&&nowMs-incident.observedAtMs<=600000,
      'STALE_SITE_INCIDENT');
    const prior=this.incidents.get(incident.incidentId);
    if(prior){
      invariant(canonicalJson(prior)===canonicalJson(incident),'SITE_INCIDENT_REPLAY_CONFLICT');
      return {duplicate:true,sessionStopped:prior.severity==='STOP',fieldValidated:false};
    }
    this.current();
    invariant(this.incidents.size<1000,'SITE_INCIDENT_LIMIT');
    if(incident.severity==='STOP')
      this.session.stop(actor,nowMs,'SITE_HAZARD');
    this.incidents.set(incident.incidentId,structuredClone(incident));
    return {duplicate:false,sessionStopped:incident.severity==='STOP',fieldValidated:false};
  }
  /** Private view only: never return raw contact details or sensor certainty. */
  snapshot(actor:SceneActor,nowMs:number){
    requireSceneRole(actor,this.scope,['organizer','operator','steward'],nowMs);
    const snap=this.session.snapshot();
    return structuredClone({siteRevision:this.siteRevision,sessionState:snap.state,
      contacts:this.contacts,incidents:[...this.incidents.values()],fieldValidated:false as const});
  }
}
