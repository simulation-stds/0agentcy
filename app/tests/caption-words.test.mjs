import test from 'node:test';import assert from 'node:assert/strict';import {readFile}from'node:fs/promises';import ts from'typescript';
const source=await readFile(new URL('../src/lib/caption-words.ts',import.meta.url),'utf8');const {outputText}=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});const {captionWords,captionIntervals,transcriptWords}=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const cue={id:'a',start:1,end:3,text:'One two',words:[{word:'One',start:1,end:1.4},{word:'two',start:2,end:3}],speaker:'a'};
test('aligned words retain timing gaps and edited text never uses stale word labels',()=>{
 const exact=captionWords(cue);assert.equal(exact.estimated,false);assert.equal(exact.words[1].start,2);
 const edited={...cue,text:'One corrected sentence'};const result=captionWords(edited);assert.equal(result.estimated,true);assert.equal(result.words.map(w=>w.text).join(' '),edited.text);assert.equal(result.words[0].start,1);assert.equal(result.words[2].end,3);assert.equal(cue.words[1].word,'two');
});
test('manual timing review and explicit newlines are retained',()=>{
 const result=captionWords({...cue,text:'One\ntwo',wordTimingEstimated:true});assert.equal(result.estimated,true);assert.equal(result.words[1].before,'\n');
 const confirmed=captionWords({...cue,text:'One\ntwo',words:transcriptWords(result.words),wordTimingEstimated:false});assert.equal(confirmed.estimated,false);
});
test('malformed or overlapping word timing falls back to estimated current text',()=>{
 for(const words of [[{word:'One',start:1,end:2.5},{word:'two',start:2,end:3}],[{word:'One',start:0,end:1.4},{word:'two',start:2,end:3}]])assert.equal(captionWords({...cue,words}).estimated,true);
});
test('caption intervals cover the full video, including gaps and active-word changes',()=>{
 const p={cues:[cue],language:'en'};const intervals=captionIntervals(p,4,true);assert.deepEqual(intervals,[{start:0,end:1},{start:1,end:1.4},{start:1.4,end:2},{start:2,end:3},{start:3,end:4}]);assert.deepEqual(captionIntervals(p,4,false),[{start:0,end:1},{start:1,end:3},{start:3,end:4}]);
});
test('CJK segmentation preserves visible text rather than adding spaces',()=>{
 const c={...cue,text:'你好世界。',words:undefined};const words=captionWords(c,'zh').words;assert.equal(words.map(w=>w.before+w.text).join(''),'你好世界。');
});

test('timing edits preserve matching word scores and speaker labels',()=>{const original=[{word:'One',start:1,end:2,score:.9,speaker:'a'}];const words=transcriptWords([{text:'One',before:'',start:1.2,end:2.2}],original);assert.equal(words[0].speaker,'a');assert.equal(words[0].score,.9);assert.equal(original[0].start,1);});
