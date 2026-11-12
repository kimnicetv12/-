// 무료 사진·영상 검색 (PC 서버와 휴대폰 앱이 같이 씀)
import type { Settings } from '../settings';
import { http } from './net';

export interface MediaHit { id: string; source: string; kind: 'image' | 'video'; thumb: string; url: string; title: string; credit: string; license: string; width?: number; height?: number }

const OK_LICENSE = /^(cc0|public domain|pd|cc by(-sa)? ?\d|cc-by(-sa)?-?\d)/i;

export async function searchRemoteMedia(s: Settings, q: string, source: string): Promise<MediaHit[]> {
  if (source === 'pexels') {
    if (!s.keys.pexels) throw new Error('Pexels 키가 없어요. 설정에서 넣어 주세요.');
    const r = await http(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=30`, { headers: { authorization: s.keys.pexels } });
    const j = await r.json();
    return (j.photos || []).map((p: any) => ({ id: `px${p.id}`, source: 'pexels', kind: 'image', thumb: p.src.medium, url: p.src.large2x, title: p.alt || q, credit: `${p.photographer} / Pexels`, license: 'Pexels', width: p.width, height: p.height }));
  }
  if (source === 'pexels-video') {
    if (!s.keys.pexels) throw new Error('Pexels 키가 없어요. 설정에서 넣어 주세요.');
    const r = await http(`https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&per_page=20`, { headers: { authorization: s.keys.pexels } });
    const j = await r.json();
    return (j.videos || []).map((v: any) => {
      const f = (v.video_files || []).filter((x: any) => x.width && x.width <= 1920).sort((a: any, b: any) => b.width - a.width)[0] || v.video_files?.[0];
      return { id: `pv${v.id}`, source: 'pexels', kind: 'video', thumb: v.image, url: f?.link, title: q, credit: `${v.user?.name} / Pexels`, license: 'Pexels', width: f?.width, height: f?.height };
    }).filter((x: MediaHit) => x.url);
  }
  if (source === 'pixabay') {
    if (!s.keys.pixabay) throw new Error('Pixabay 키가 없어요. 설정에서 넣어 주세요.');
    const r = await http(`https://pixabay.com/api/?key=${encodeURIComponent(s.keys.pixabay)}&q=${encodeURIComponent(q)}&image_type=photo&per_page=30&safesearch=true`);
    const j = await r.json();
    return (j.hits || []).map((h: any) => ({ id: `pb${h.id}`, source: 'pixabay', kind: 'image', thumb: h.webformatURL, url: h.largeImageURL, title: h.tags, credit: `${h.user} / Pixabay`, license: 'Pixabay', width: h.imageWidth, height: h.imageHeight }));
  }
  // 위키미디어 공용 (상업 이용 가능한 라이선스만)
  const api = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=40&gsrsearch=${encodeURIComponent(`filetype:bitmap ${q}`)}&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=640`;
  const r = await http(api, {});
  const j = await r.json();
  const pages = Object.values(j.query?.pages || {}) as any[];
  return pages.map((p) => {
    const ii = p.imageinfo?.[0];
    const m = ii?.extmetadata || {};
    const lic = String(m.LicenseShortName?.value || '');
    const artist = String(m.Artist?.value || '').replace(/<[^>]+>/g, '').trim();
    return { id: `wm${p.pageid}`, source: 'wikimedia', kind: 'image' as const, thumb: ii?.thumburl, url: ii?.url, title: String(p.title).replace(/^File:/, ''), credit: `${artist || '작성자 미상'} / ${lic} / ${ii?.descriptionurl || ''}`, license: lic, width: ii?.width, height: ii?.height };
  }).filter((h) => h.url && OK_LICENSE.test(h.license.replace(/\s+/g, ' ').trim()));
}
