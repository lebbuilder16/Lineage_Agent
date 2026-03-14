import StatusBarIPhone from '../imports/StatusBarIPhone-10-489';

interface StatusBarProps {
  textColor?: 'black' | 'white';
}

export function StatusBar({ textColor = 'black' }: StatusBarProps) {
  return (
    <div className="h-[64px] w-full">
      <StatusBarIPhone textColor={textColor} />
    </div>
  );
}