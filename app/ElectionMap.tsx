import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { FeatureCollection, Feature } from 'geojson';
import { canReadLeader, candidateKey, percent, type Result } from './lib/analysis';
import { colorForCandidate, sequentialColor } from './lib/color';
import type { Scale } from './lib/types';

export type Metric = 'participation' | 'abstention' | 'tete' | 'score_candidat';
export function featureCode(f: Feature, scale: Scale): string {
  const p=f.properties ?? {};
  return String(scale==='commune'?p.code:scale==='bv'?p.codeBureauVote:scale==='canton'?p.code_canton:p.code_circonscription);
}
export function valueFor(u:Result,metric:Metric,candidate:string) {
  if(metric==='participation') return u.inscrits?100*u.votants/u.inscrits:null;
  if(metric==='abstention') return u.inscrits?100*u.abstentions/u.inscrits:null;
  if(!canReadLeader(u)) return null;
  if(metric==='score_candidat') return u.candidats.find(c=>candidateKey(c)===candidate)?.pct_exprimes ?? null;
  return u.candidats[0]?.pct_exprimes ?? null;
}

export default function ElectionMap({geo,mask,outline,units,scale,metric,candidate,selected,onSelect}: {
  geo:FeatureCollection|null;mask:FeatureCollection|null;outline:FeatureCollection|null;units:Record<string,Result>;scale:Scale;metric:Metric;candidate:string;selected:string|null;onSelect:(code:string)=>void;
}) {
  const node=useRef<HTMLDivElement>(null),map=useRef<L.Map|null>(null),layer=useRef<L.GeoJSON|null>(null);
  const select=useRef(onSelect);select.current=onSelect;
  const [ready,setReady]=useState(false);
  const [tilesError,setTilesError]=useState(false);
  useEffect(()=>{
    if(!node.current)return;
    const m=L.map(node.current,{zoomControl:false,minZoom:9,maxZoom:18,maxBounds:[[48.7,1.2],[49.5,3]],maxBoundsViscosity:1});
    map.current=m;
    m.fitBounds([[48.9,1.6],[49.24,2.6]]);
    L.control.zoom({position:'bottomleft'}).addTo(m);
    const tiles=L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap © CARTO',subdomains:'abcd',maxZoom:19});
    tiles.on('tileerror',()=>setTilesError(true));tiles.addTo(m);
    m.createPane('outside');m.getPane('outside')!.style.zIndex='450';m.getPane('outside')!.style.pointerEvents='none';
    m.createPane('boundary');m.getPane('boundary')!.style.zIndex='460';m.getPane('boundary')!.style.pointerEvents='none';
    const observer=new ResizeObserver(()=>m.invalidateSize());observer.observe(node.current);
    setReady(true);
    return()=>{observer.disconnect();m.remove();map.current=null;setReady(false);};
  },[]);
  useEffect(()=>{
    if(!map.current||!ready)return;
    const layers:L.Layer[]=[];
    if(mask)layers.push(L.geoJSON(mask,{pane:'outside',interactive:false,style:{fillColor:'#e9edef',fillOpacity:1,stroke:false}}).addTo(map.current));
    if(outline)layers.push(L.geoJSON(outline,{pane:'boundary',interactive:false,style:{color:'#667783',weight:1.6,fill:false}}).addTo(map.current));
    return()=>{layers.forEach(l=>l.remove());};
  },[mask,outline,ready]);
  useEffect(()=>{
    if(!map.current||!ready||!geo)return;
    const group=L.geoJSON(geo,{
      style:f=>{
        const code=featureCode(f!,scale),u=units[code];
        const value=u?valueFor(u,metric,candidate):null;
        const fillColor=value===null?'#d9dfe2':metric==='tete'?colorForCandidate(u.candidats[0].nom,u.candidats[0].nuance):sequentialColor(value,0,100);
        return {fillColor,fillOpacity:value===null?.55:.85,color:'#fff',weight:scale==='bv'?.6:1.2};
      },
      onEachFeature:(f,lyr)=>{
        const code=featureCode(f,scale),u=units[code];
        const tip=document.createElement('div');
        tip.textContent=u?`${u.nom} · ${percent(valueFor(u,metric,candidate))}`:`${f.properties?.nom ?? f.properties?.nomCommune ?? code} · Pas de résultat à ce tour`;
        lyr.bindTooltip(tip,{sticky:true});
        lyr.on('click',()=>select.current(code));
        lyr.on('mouseover',()=>{(lyr as L.Path).setStyle({weight:2.3,color:'#6b75c7'});});
        lyr.on('mouseout',()=>{group.resetStyle(lyr as L.Path);const path=lyr as L.Path & {feature:Feature};if(path.feature.properties?._selected)(lyr as L.Path).setStyle({color:'#000091',weight:3,dashArray:'5 3'});});
      }
    }).addTo(map.current);
    layer.current=group;
    return()=>{group.remove();layer.current=null;};
  },[geo,units,scale,metric,candidate,ready]);
  useEffect(()=>{
    layer.current?.eachLayer(lyr=>{
      const l=lyr as L.Path & {feature:Feature};
      const active=featureCode(l.feature,scale)===selected;
      l.feature.properties={...l.feature.properties,_selected:active};
      layer.current!.resetStyle(l);
      if(active)l.setStyle({color:'#000091',weight:3,dashArray:'5 3'});
    });
  },[selected,geo,units,metric,candidate,scale,ready]);
  function recenter(){if(map.current)map.current.fitBounds(outline?L.geoJSON(outline).getBounds():L.latLngBounds([[48.9,1.6],[49.24,2.6]]),{padding:[24,24]});}
  return <div className="map-frame"><div ref={node} className="map" aria-label="Carte du Val-d’Oise. Utilisez le tableau pour sélectionner un territoire au clavier."/>
    <button className="map-reset" onClick={recenter}>Recentrer</button>
    <div className="map-caption">{tilesError?'Fond indisponible · contours et résultats restent consultables':'Fond neutre · hors département masqué'}</div>
  </div>;
}
