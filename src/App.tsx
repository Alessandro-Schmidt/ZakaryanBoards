import { useEffect, useState } from 'react';
import { Gallery } from './components/Gallery';
import { Editor } from './components/Editor';

const parseHash = () => /^#\/board\/(.+)$/.exec(location.hash)?.[1] ?? null;

export function App() {
  const [boardId, setBoardId] = useState(parseHash);
  useEffect(() => {
    const onHash = () => setBoardId(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const open = (id: string) => (location.hash = `#/board/${id}`);
  const back = () => (location.hash = '');

  return (
    <>
      <div className="backdrop" aria-hidden>
        <span className="blob b1" />
        <span className="blob b2" />
        <span className="blob b3" />
        <span className="blob b4" />
      </div>
      {boardId ? <Editor key={boardId} boardId={boardId} onBack={back} /> : <Gallery onOpen={open} />}
    </>
  );
}
