import { img } from "./svg-0b61c";

function Frame() {
  return <img className="block max-w-none size-full" src={img} />;
}

export default function Download1() {
  return (
    <div className="relative size-full" data-name="download 1">
      <Frame />
    </div>
  );
}