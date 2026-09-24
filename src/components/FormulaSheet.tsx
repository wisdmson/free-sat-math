import MathText from './MathText';

/** Standard formulas and facts, in our own layout. */
const SECTIONS: ReadonlyArray<{ title: string; items: ReadonlyArray<readonly [string, string]> }> =
  [
    {
      title: 'Area and circumference',
      items: [
        ['Rectangle', '$A = \\ell w$'],
        ['Triangle', '$A = \\frac{1}{2}bh$'],
        ['Circle', '$A = \\pi r^2$ and $C = 2\\pi r$'],
      ],
    },
    {
      title: 'Right triangles',
      items: [
        ['Pythagorean theorem', '$a^2 + b^2 = c^2$'],
        ['45-45-90 triangle', 'sides $s$, $s$, $s\\sqrt{2}$'],
        ['30-60-90 triangle', 'sides $x$, $x\\sqrt{3}$, $2x$'],
      ],
    },
    {
      title: 'Volume',
      items: [
        ['Rectangular box', '$V = \\ell wh$'],
        ['Cylinder', '$V = \\pi r^2 h$'],
        ['Sphere', '$V = \\frac{4}{3}\\pi r^3$'],
        ['Cone', '$V = \\frac{1}{3}\\pi r^2 h$'],
        ['Rectangular pyramid', '$V = \\frac{1}{3}\\ell wh$'],
      ],
    },
    {
      title: 'Angles and arcs',
      items: [
        ['Angles of a triangle', 'add up to $180^\\circ$'],
        ['One full turn', '$360^\\circ$, which is $2\\pi$ radians'],
      ],
    },
  ];

export default function FormulaSheet() {
  return (
    <div className="formula-sheet">
      {SECTIONS.map((section) => (
        <section key={section.title}>
          <h3>{section.title}</h3>
          <dl>
            {section.items.map(([name, formula]) => (
              <div key={name} className="formula-row">
                <dt>{name}</dt>
                <dd>
                  <MathText text={formula} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
