import { isSkillAvailable } from '../engine/registry';
import { DOMAINS, skillsInDomain } from '../engine/skills';
import { url } from '../lib/paths';
import { attemptCount, skillAccuracy } from '../store/progress';
import { useProgress } from '../store/progress-store';

/** All 19 skills by domain. Rendered on the server, then filled in with the student's stats. */
export default function SkillsList() {
  const { progress } = useProgress();
  return (
    <div className="skills">
      {DOMAINS.map((domain) => (
        <section key={domain.id} className="domain" aria-labelledby={`domain-${domain.id}`}>
          <h2 id={`domain-${domain.id}`}>{domain.name}</h2>
          <p className="hint">About {Math.round(domain.share * 100)}% of the math questions</p>
          <ul className="skill-list">
            {skillsInDomain(domain.id).map((skill) => {
              const available = isSkillAvailable(skill.id);
              const tried = attemptCount(progress, skill.id);
              const acc = skillAccuracy(progress, skill.id);
              return (
                <li key={skill.id} className={available ? '' : 'is-soon'}>
                  {available ? (
                    <a href={url(`/skills/${skill.id}/`)}>{skill.name}</a>
                  ) : (
                    <span>{skill.name}</span>
                  )}
                  {!available && <span className="badge">Coming soon</span>}
                  {available && tried > 0 && (
                    <span className="stat">
                      {tried} tried · {Math.round((100 * acc.correct) / acc.attempts)}% of last{' '}
                      {acc.attempts}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
