import { imgBattery, imgCellularConnection, imgWifi } from "./svg-w0wgu";

function Time({ textColor }: { textColor?: 'black' | 'white' }) {
  return (
    <div className="basis-0 box-border content-stretch flex gap-2.5 grow h-[22px] items-center justify-center min-h-px min-w-px pb-0 pt-0.5 px-0 relative shrink-0" data-name="Time">
      <div className={`font-['SF_Pro:Semibold',_sans-serif] font-[590] leading-[0] relative shrink-0 text-[17px] ${textColor === 'white' ? 'text-white' : 'text-black'} text-center text-nowrap`} style={{ fontVariationSettings: "'wdth' 100" }}>
        <p className="leading-[22px] whitespace-pre">9:41</p>
      </div>
    </div>
  );
}

function Battery() {
  return (
    <div className="h-[13px] relative shrink-0 w-[27.328px]" data-name="Battery">
      <img className="block max-w-none size-full" src={imgBattery} />
    </div>
  );
}

function Levels() {
  return (
    <div className="basis-0 box-border content-stretch flex gap-[7px] grow h-[22px] items-center justify-center min-h-px min-w-px pb-0 pt-px px-0 relative shrink-0" data-name="Levels">
      <div className="h-[12.226px] relative shrink-0 w-[19.2px]" data-name="Cellular Connection">
        <img className="block max-w-none size-full" src={imgCellularConnection} />
      </div>
      <div className="h-[12.328px] relative shrink-0 w-[17.142px]" data-name="Wifi">
        <img className="block max-w-none size-full" src={imgWifi} />
      </div>
      <Battery />
    </div>
  );
}

export default function StatusBarIPhone({ textColor }: { textColor?: 'black' | 'white' }) {
  return (
    <div className="relative size-full" data-name="Status bar - iPhone">
      <div className="flex flex-row items-center justify-center relative size-full">
        <div className="box-border content-stretch flex gap-[154px] items-center justify-center pb-[19px] pt-[21px] px-4 relative size-full">
          <Time textColor={textColor} />
          <Levels />
        </div>
      </div>
    </div>
  );
}