// A component that lays itself out against one side of the screen. Every line here is correct in
// English and wrong in Arabic, which is exactly why a person reading it will not notice.
export const Sideways = () => (
  <div className="ml-4 pr-2 text-left border-l">
    <span className="-mr-6 rounded-r-sm">x</span>
    <span className="left-0 absolute">y</span>
  </div>
);
