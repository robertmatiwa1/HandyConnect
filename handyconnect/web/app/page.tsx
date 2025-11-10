'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

const DEFAULT_SKILL = 'plumber';
const DEFAULT_SUBURB = 'Bellville';

export default function HomePage() {
  const router = useRouter();
  const [skill, setSkill] = useState(DEFAULT_SKILL);
  const [suburb, setSuburb] = useState(DEFAULT_SUBURB);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams({ skill, suburb });
    router.push(`/search?${params.toString()}`);
  };

  return (
    <div style={{ maxWidth: 520, margin: '0 auto' }}>
      <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24 }}>Find trusted tradespeople near you</h2>
      <form onSubmit={handleSubmit}>
        <label className="label" htmlFor="skill">
          Skill
        </label>
        <input
          id="skill"
          className="input"
          placeholder="Skill (e.g. plumber)"
          value={skill}
          onChange={(event) => setSkill(event.target.value)}
        />
        <label className="label" htmlFor="suburb">
          Suburb
        </label>
        <input
          id="suburb"
          className="input"
          placeholder="Suburb"
          value={suburb}
          onChange={(event) => setSuburb(event.target.value)}
        />
        <button type="submit" className="button" style={{ width: '100%' }}>
          Search providers
        </button>
      </form>
    </div>
  );
}
