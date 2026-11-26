// Keep prose as Markdown. Disable HTML, image embeds and notifications outside code.
function prose(text) {
  return text.replaceAll('<','&lt;').replaceAll('@','@\u200b')
    .replace(/(\\*)!\[/g,(_,slashes)=>`${slashes}${slashes.length%2?'':'\\'}![`);
}
function inline(line) {
  const ticks=[...line.matchAll(/`+/g)];let offset=0,result='';
  for(let i=0;i<ticks.length;i++) {
    const start=ticks[i];
    let backslashes=0;for(let p=start.index-1;p>=0 && line[p]==='\\';p--)backslashes++;
    if(backslashes%2)continue;
    let end=i+1;while(end<ticks.length && ticks[end][0].length!==start[0].length)end++;
    if(end===ticks.length)continue;
    const finish=ticks[end].index+ticks[end][0].length;
    result+=prose(line.slice(offset,start.index))+line.slice(start.index,finish);
    offset=finish;i=end;
  }
  return result+prose(line.slice(offset));
}
export function markdown(text) {
  const lines=String(text).replaceAll('\r\n','\n').split('\n');
  const output=[];let fence=null;
  for(const line of lines) {
    if(fence) {
      const close=line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      output.push(line);
      if(close && close[1][0]===fence[0] && close[1].length>=fence.length)fence=null;
      continue;
    }
    const open=line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if(open) {
      fence=open[1];
      const language=open[2].trim();
      // GitHub supports active diagram fences. Treat unknown fence types as plain code.
      const safe=/^(?:js|javascript|json|sh|bash|py|python|ts|typescript|sql|text|txt|diff|yaml|yml|html|css|md|markdown|console|shell|toml)?$/i.test(language)?language:'text';
      output.push(fence+safe);continue;
    }
    output.push(inline(line.replace(/((?:`{3,}|~{3,}))\s*(?:mermaid|geojson|topojson|stl)(?=\s*$)/gi,'$1text')));
  }
  // Do not let a truncated model code example swallow the trusted footer.
  if(fence)output.push(fence);
  return output.join('\n');
}
