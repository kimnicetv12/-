// InfoCut Bridge — 프리미어 프로 쪽 스크립트 (ExtendScript)
// 패널(index.html)이 evalScript 로 부른다. 돌려주는 값은 모두 JSON 문자열.

function _q(s) { return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '') + '"'; }
function _ok(extra) { return '{"ok":true' + (extra ? ',' + extra : '') + '}'; }
function _err(msg) { return '{"ok":false,"error":' + _q(msg) + '}'; }
function _parse(s) { return eval('(' + s + ')'); } // InfoCut 이 만든 JSON 만 넘긴다

/** XML 을 가져와서 새로 생긴 시퀀스를 연다 */
function infocut_importXML(xmlPath) {
  try {
    var f = new File(xmlPath);
    if (!f.exists) return _err('XML 파일이 없어요: ' + xmlPath);
    var before = {};
    for (var i = 0; i < app.project.sequences.numSequences; i++) before[app.project.sequences[i].sequenceID] = true;
    app.project.importFiles([f.fsName], true, app.project.getInsertionBin(), false);
    var opened = '';
    for (var j = 0; j < app.project.sequences.numSequences; j++) {
      var s = app.project.sequences[j];
      if (!before[s.sequenceID]) { app.project.openSequence(s.sequenceID); opened = s.name; }
    }
    return _ok('"sequence":' + _q(opened));
  } catch (e) { return _err(e.toString()); }
}

function _textParam(comp) {
  var props = comp.properties;
  var fallback = null;
  for (var i = 0; i < props.numItems; i++) {
    var p = props[i];
    var name = String(p.displayName || '');
    var v = null;
    try { v = p.getValue(); } catch (e) { v = null; }
    if (typeof v !== 'string') continue;
    if (/text|텍스트|자막|caption|title|제목|name/i.test(name)) return p;
    if (!fallback) fallback = p;
  }
  return fallback;
}

function _setText(p, text) {
  var cur = p.getValue();
  if (typeof cur === 'string' && cur.charAt(0) === '{') {
    // 최신 MOGRT 는 {"textEditValue": "..."} 모양
    try {
      var o = _parse(cur);
      o.textEditValue = text;
      var parts = [];
      for (var k in o) {
        if (!o.hasOwnProperty(k)) continue;
        var val = o[k];
        parts.push(_q(k) + ':' + (typeof val === 'string' ? _q(val) : (typeof val === 'object' ? _stringify(val) : String(val))));
      }
      p.setValue('{' + parts.join(',') + '}', true);
      return;
    } catch (e) { /* 아래로 */ }
  }
  p.setValue(text, true);
}

function _stringify(v) {
  if (v === null) return 'null';
  if (typeof v === 'string') return _q(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Array) { var a = []; for (var i = 0; i < v.length; i++) a.push(_stringify(v[i])); return '[' + a.join(',') + ']'; }
  var parts = [];
  for (var k in v) if (v.hasOwnProperty(k)) parts.push(_q(k) + ':' + _stringify(v[k]));
  return '{' + parts.join(',') + '}';
}

/**
 * 자막마다 MOGRT 를 올리고 글자를 넣는다.
 * captionsJson: infocut_captions.json 내용, targetTrack: 0부터 센 비디오 트랙 번호(기본 V4=3), hideTrack: 숨길 그림 자막 트랙(V3=2)
 */
function infocut_applyMogrt(mogrtPath, captionsJson, targetTrack, hideTrack) {
  try {
    var seq = app.project.activeSequence;
    if (!seq) return _err('먼저 InfoCut 시퀀스를 열어 주세요.');
    var data = _parse(captionsJson);
    var caps = data.captions || [];
    if (!caps.length) return _err('자막이 없어요.');
    if (seq.videoTracks.numTracks <= targetTrack) return _err('V' + (targetTrack + 1) + ' 트랙이 없어요. InfoCut 에서 다시 내보낸 XML 을 쓰세요.');
    var done = 0, noText = 0;
    for (var i = 0; i < caps.length; i++) {
      var c = caps[i];
      var t = new Time(); t.seconds = c.start;
      var item = seq.importMGT(mogrtPath, t.ticks, targetTrack, 0);
      if (!item) continue;
      try { var e = new Time(); e.seconds = c.end; item.end = e; } catch (err) { /* 길이 조절 실패는 넘어감 */ }
      var comp = item.getMGTComponent();
      var p = comp ? _textParam(comp) : null;
      if (p) _setText(p, c.text); else noText++;
      done++;
    }
    if (hideTrack >= 0 && seq.videoTracks.numTracks > hideTrack) {
      try { seq.videoTracks[hideTrack].setMute(1); } catch (err2) { /* 옛 버전 */ }
    }
    return _ok('"count":' + done + ',"noText":' + noText);
  } catch (e) { return _err(e.toString()); }
}

/** 지금 시퀀스 이름 */
function infocut_activeSequence() {
  var s = app.project.activeSequence;
  return s ? _ok('"name":' + _q(s.name)) : _ok('"name":""');
}
