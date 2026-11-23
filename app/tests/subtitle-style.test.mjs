import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const { outputText } = ts.transpileModule(await readFile(new URL('../src/lib/subtitles.ts', import.meta.url), 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}});
const {exportAss, validProject, defaultSubtitleStyle} = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const project = {version:1,source:'/test.mp4',language:'en',model:'tiny',rangeStart:80,rangeEnd:100,speakers:{a:'Alice'},recognizedSegments:[],cues:[{id:'a',start:81.234,end:83.567,text:'Hello, world!\nSecond line',speaker:'a'}]};
test('ASS exports style fields, layers, selection offsets, labels and centisecond timing',()=>{
 const text=exportAss({...project, subtitleStyle:{...defaultSubtitleStyle,font:'Georgia',size:72,color:'#123456',outline:4,backgroundOpacity:50,position:'top'}},true,true);
 assert.ok(text.startsWith('[Script Info]\n'));
 assert.match(text,/Style: Default,Georgia,72,&H00563412/);
 assert.match(text,/,1,4,0,8,96,96,100,1/);
 assert.match(text,/&H80000000/);
 assert.match(text,/Dialogue: 1,0:00:01.23,0:00:03.57,Default,,0,0,0,,Alice: Hello, world!\\NSecond line/);
 assert.equal(text.match(/^Dialogue:/gm).length,2);
 assert.equal(project.cues[0].start,81.234);
});
test('zero opacity excludes box layer and malformed style imports are rejected',()=>{
 const styled={...project,subtitleStyle:{...defaultSubtitleStyle,backgroundOpacity:0}};
 assert.ok(validProject(styled)); assert.ok(validProject(project));
 assert.equal(exportAss(styled).match(/^Dialogue:/gm).length,1);
 for(const patch of [{font:'Arial,Injected'},{size:NaN},{outline:-1},{color:'red'},{backgroundOpacity:101},{position:'elsewhere'}]) assert.equal(validProject({...styled,subtitleStyle:{...styled.subtitleStyle,...patch}}),false);
});
test('dialogue cannot inject ASS overrides or extra events',()=>{
 const text=exportAss({...project,cues:[{...project.cues[0],text:'{\\pos(0,0)} literal \\N\r\nDialogue: fake'}]});
 assert.ok(text.includes('\\{\\\uFEFFpos(0,0)\\}'));
 assert.ok(text.includes('literal \\\uFEFFN\\NDialogue: fake'));
 assert.equal(text.match(/^Dialogue:/gm).length,2);
});
test('portrait video exports a matching reference aspect ratio',()=>{
 const text=exportAss(project,false,false,{width:1080,height:1920});
 assert.match(text,/PlayResX: 608\nPlayResY: 1080/);
 assert.match(text,/,30,30,100,1/);
});
