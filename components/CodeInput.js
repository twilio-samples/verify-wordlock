import { forwardRef } from "react";

const CodeInput = forwardRef((props, ref) => {
  const { value, onKeyDown, index, onChange, onFocus, disabled, inputMode = "numeric" } = props;

  const handleChange = (e) => {
    const pattern = /^\d+$/;
    const newValue = e.target.value;
    if (newValue.length !== 0 && !pattern.test(newValue)) {
      return;
    }
    onChange(newValue, index);
  };

  const handleKeyDown = (e) => {
    onKeyDown(e, index);
  };

  return (
    <input
      ref={ref}
      value={value}
      className="tile"
      type="text"
      inputMode={inputMode}
      autoComplete="one-time-code"
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onFocus={() => onFocus?.(index)}
      disabled={disabled}
    />
  );
});

CodeInput.displayName = "CodeInput";

export default CodeInput;
