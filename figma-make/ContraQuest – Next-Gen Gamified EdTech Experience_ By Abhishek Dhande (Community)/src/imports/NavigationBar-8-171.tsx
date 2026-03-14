import { imgHome01, imgFrame, imgFrame1, imgFrame2, imgFrame3 } from "./svg-vnq26";

function Home01() {
  return (
    <div className="relative shrink-0 size-6" data-name="home-01">
      <img className="block max-w-none size-full" src={imgHome01} />
    </div>
  );
}

function Frame() {
  return (
    <div className="relative shrink-0 size-6" data-name="Frame">
      <img className="block max-w-none size-full" src={imgFrame} />
    </div>
  );
}

function Frame1() {
  return (
    <div className="relative shrink-0 size-6" data-name="Frame">
      <img className="block max-w-none size-full" src={imgFrame1} />
    </div>
  );
}

function Frame3() {
  return (
    <div className="relative shrink-0 size-6" data-name="Frame">
      <img className="block max-w-none size-full" src={imgFrame2} />
    </div>
  );
}

function Frame4() {
  return (
    <div className="relative shrink-0 size-6" data-name="Frame">
      <img className="block max-w-none size-full" src={imgFrame3} />
    </div>
  );
}

function Frame2() {
  return (
    <div className="absolute content-stretch flex gap-10 items-center justify-start left-1/2 top-1/2 translate-x-[-50%] translate-y-[-50%]">
      <Home01 />
      <Frame />
      <Frame1 />
      <Frame3 />
      <Frame4 />
    </div>
  );
}

export default function NavigationBar() {
  return (
    <div className="bg-[#091a7a] relative rounded-[50px] size-full" data-name="navigation bar">
      <div aria-hidden="true" className="absolute border border-solid border-white inset-0 pointer-events-none rounded-[50px] shadow-[1px_5px_10px_0px_rgba(0,0,0,0.25)]" />
      <div className="absolute bg-white left-2.5 rounded-[40px] size-[60px] top-1/2 translate-y-[-50%]" />
      <Frame2 />
    </div>
  );
}