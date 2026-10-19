// GENERATED from core/hazards.ts by tools/build.mjs. Edit the source, then run `npm run build`.
// Hazard profiles: what an alert tells the user and asks of them, kept apart from how a Lens
// draws it. The Lens wires up one profile, the earthquake; another hazard plugs in as data.

/**
 * The parts of an incoming alert that the guidance needs. Field names follow the Common Alerting
 * Protocol (CAP 1.2), the format that public alert systems such as IPAWS use.
 */
                             
                                                                           
                
                              
               
                                               
                     
                                                                             
                   
                                                                                           
                                                          
                     
                                                                             
                     
 

/** During: act now, no gesture needed. After: the danger has passed, details and next steps. */
                                                     

                                
             
                                                           
                   
                
                                                                        
                   
                                        
                   
                                                    
                    
                                                 
                       
                                                              
                  
                                                          
                         
 

/**
 * Guidance: Earthquake Country Alliance and Ready.gov. Drop, cover and hold on where you are;
 * don't move to another room while the ground shakes; expect aftershocks.
 */
export const EARTHQUAKE                = {
  id: "earthquake",
  capEvent: "Earthquake",
  title: "Earthquake alert",
  headline: "Drop, Cover, Hold On",
  during: ["Stay where you are.", "Protect your head and neck."],
  spotLabel: "Cover spot",
  advanceLabel: "Shaking stopped",
  after: ["Expect aftershocks: drop, cover and hold on again."],
  guidanceSource: "Earthquake Country Alliance, Ready.gov",
};

export const HAZARD_PROFILES                           = [EARTHQUAKE];

export function profileForAlert(alert            , profiles                           = HAZARD_PROFILES)                            {
  const event = alert.event.trim().toLowerCase();
  return profiles.find((p) => p.capEvent.toLowerCase() === event);
}

/** The stage after the user's action; other actions leave the stage as it is. */
export function nextStage(stage            , action                    )             {
  if (stage === "during" && action === "advance") return "after";
  if (stage === "after" && action === "safe") return "done";
  return stage;
}
