interface Props {
  kind: 'character' | 'chapter';
  name: string;
  prompt: string;
  status: 'pending' | 'generating' | 'done';
  imageUrl: string | null;
}

export function EntityCard({ kind, name, prompt, status, imageUrl }: Props) {
  const noun = kind === 'character' ? 'Portrait' : 'Illustration';
  return (
    <div className="entity-card">
      <div className={`art ${kind === 'chapter' ? 'chapter' : ''} ${status !== 'done' ? 'pending' : ''}`}>
        {status === 'done' && imageUrl ? (
          <img src={imageUrl} alt={`${noun} of ${name}`} />
        ) : status === 'generating' ? (
          <div style={{ textAlign: 'center' }}>
            <span className="spinner" role="status" aria-label={`Generating ${noun.toLowerCase()}`} />
            <div className="gen-caption">
              Generating {kind === 'character' ? `portrait for ${name}` : 'illustration'}…
            </div>
          </div>
        ) : (
          <span className="placeholder-label muted">Not generated yet</span>
        )}
      </div>
      <div className="body">
        <h5>{name}</h5>
        <p>{prompt}</p>
      </div>
    </div>
  );
}
