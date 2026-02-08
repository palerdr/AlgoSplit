import sys
import os
backend_path = os.path.join(os.path.dirname(__file__), 'backend')
sys.path.insert(0, backend_path)

from core.MainClasses import Split

my_split = [

    ("Full-Body", 1, {
        "Chest Fly": 2,
        "Wide Grip Pulldown": 2,
        "Lateral Raise Machine": 2,
        "Kelso Shrug": 2,
        "SA Lat Row": 2,
        "Rear Delt Fly": 1,
        "Upper Chest Fly": 1,
        "Front Raise": 1,
        "Rack Pull" : 2,
        "Ab Crunch" : 2,
        "SA Preacher Curl": 2,
        "SA Tricep Extension": 2,
        "Machine Leg Extension": 2,
        "Seated Hamstring Curl": 2,
        "SA Overhead Extension": 2,
        "Seated Supinations": 1,
        "Calf Raises" : 2,
        "Forearm Curl" : 2,
        "Hammer Curl" : 1
    }),

    ("Rest", 2 ,{})
]


print("ANALYZING SPLIT...")

split = Split(
    name="My Split",
    days=my_split,
    stimulus_duration=36,
    maintenance_volume=3,
    dataset="average"
)

split.simulate_split()
report = split.get_report()
print(report)

print("MUSCLE SUMMARY")

muscle_list = []
for name, muscle in split.muscles.items():
    muscle_list.append({
        'name': name,
        'net': muscle.net_weekly_stimulus(),
        'sets': muscle.primary_sets,
        'freq': len(muscle.session_times)
    })

muscle_list.sort(key=lambda x: x['net'], reverse=True)

for m in muscle_list:
    print(f"{m['name']:15} | Net: {m['net']:5.2f} | Sets: {m['sets']:2} | Freq: {m['freq']}x")

print("\n")
