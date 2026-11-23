"""Generate the shared 32×32 void-and-cluster blue-noise rank tile (seed 23)."""
import math,random,json
from pathlib import Path
n=32;size=n*n;random.seed(23);kernel=[math.exp(-(min(x,n-x)**2+min(y,n-y)**2)/4.5) for y in range(n) for x in range(n)];pattern=[False]*size
for i in random.sample(range(size),size//10):pattern[i]=True
energy=[0.]*size
def update(index,sign):
 cy,cx=divmod(index,n)
 for y in range(n):
  k=((y-cy)%n)*n;start=y*n
  for x in range(n):energy[start+x]+=sign*kernel[k+(x-cx)%n]
for i,p in enumerate(pattern):
 if p:update(i,1)
for _ in range(3000):
 cluster=max((i for i in range(size) if pattern[i]),key=energy.__getitem__);pattern[cluster]=False;update(cluster,-1)
 void=min((i for i in range(size) if not pattern[i]),key=energy.__getitem__);pattern[void]=True;update(void,1)
 if void==cluster:break
initial=pattern[:];initialenergy=energy[:];ranks=[0]*size;count=sum(pattern)
for rank in range(count-1,-1,-1):
 i=max((i for i in range(size) if pattern[i]),key=energy.__getitem__);ranks[i]=rank;pattern[i]=False;update(i,-1)
pattern=initial[:];energy=initialenergy[:]
for rank in range(count,size):
 i=min((i for i in range(size) if not pattern[i]),key=energy.__getitem__);ranks[i]=rank;pattern[i]=True;update(i,1)
Path('app/src/lib/blue-noise.json').write_text(json.dumps([r//4 for r in ranks],separators=(',',':'))+'\n')
