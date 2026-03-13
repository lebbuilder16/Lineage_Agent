import imgIPhone16 from "figma:asset/110e89a881348c039db5211ca269bd480bacd45f.png";

export default function IPhoneBezel() {
  return (
    <div className="relative size-full" data-name="iPhone bezel">
      <div className="absolute bg-center bg-cover bg-no-repeat h-[912px] left-[-30px] top-[-30px] w-[453px]" data-name="iPhone 16" style={{ backgroundImage: `url('${imgIPhone16}')` }} />
    </div>
  );
}