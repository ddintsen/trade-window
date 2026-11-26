import { Fragment } from "react";

/**
 * A realm path or token key that wraps after "/", "." and "#" rather than
 * in the middle of a word, so a long path stays readable in a narrow box.
 */
export function Path({ value }: { value: string }) {
  const parts = value.split(/(?<=[/.#])/);
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {p}
          {i < parts.length - 1 && <wbr />}
        </Fragment>
      ))}
    </>
  );
}
