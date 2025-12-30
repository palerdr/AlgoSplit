from collections import defaultdict
import numpy as np
from .movementMatching import move_match

SCHOENFELD = [1.00, 1.39, 1.61, 1.77, 1.90, 2.00, 2.09, 2.16, 2.23]
PELLAND = [1.00, 1.89, 2.50, 3.07, 3.56, 4.00, 4.40, 4.78, 5.16]
AVG = [(PELLAND[i] + SCHOENFELD[i]) / 2 for i in range(0, 9)]

ds = [SCHOENFELD[0]] + [SCHOENFELD[i] - SCHOENFELD[i-1] for i in range(1, 9)]
dp = [PELLAND[0]]    + [PELLAND[i]    - PELLAND[i-1]    for i in range(1, 9)]
da = [AVG[0]]        + [AVG[i]        - AVG[i-1]        for i in range(1, 9)]

# Dataset selector
cum = {
    'schoenfeld': SCHOENFELD,
    'pelland': PELLAND,
    'average': AVG
}

marginals = {
    'schoenfeld': ds,
    'pelland': dp,
    'average': da
}


#Muscle Class
class Muscle:
    def __init__(self, name, leverage, damage_tier):
        self.name = name
        self.leverage = leverage
        self.damage_tier = damage_tier

        self.sets_this_session = 0
        self.primary_sets = 0
        self.stimulus = 0
        self.atrophy = 0
        self.last_trained_time = None
        self.last_session_time = None  # Track which session last trained this muscle
        self.session_times = set()


    """Behaviors:
    apply stimulus given the set of the workout and set of this local muscle per workout
    apply global atrophy before each next stimulus based on time since last trained
    get net weekly stimulus
    track time since last trained and when for atrophy calculations"""    

    #global atrophy function to penalize cns fatigue
    def g(self, x):
        return 0.85 + 0.15 * np.exp(-0.06 * x)
        

    def apply_stimulus(self, stimulus_amount, is_unilateral, hours_since_training, stimulus_duration, global_set_number, dataset, current_session_time):
        original_stimulus = stimulus_amount

        # Only apply heavy recovery penalty if this is a DIFFERENT session
        if (hours_since_training is not None and
            hours_since_training < stimulus_duration and
            self.last_session_time != current_session_time):

            recovery_ratio = max(0.0, min(1.0, hours_since_training / float(stimulus_duration)))
            stimulus_amount *= recovery_ratio

        #unilateral movements should increase MUR
        if is_unilateral:
            stimulus_amount *= 1.05

        # Only count for local fatigue if this muscle is significantly involved
        if original_stimulus >= 0.5:
            if self.sets_this_session < 9:
                local_mult = marginals.get(dataset)[self.sets_this_session]
            else:
                local_mult = marginals.get(dataset)[8]*(0.03*(self.sets_this_session-8))
                #super small fall off these sets are already not stimulating
            self.sets_this_session += 1
        else:
            local_mult = 1.0

        global_mult = self.g(global_set_number)

        self.stimulus += global_mult * local_mult * stimulus_amount

        if original_stimulus >= 0.5:
            self.primary_sets += 1

        return


    def apply_atrophy(self, hours_since_training, stimulus_duration, maintenance_volume, dataset):
        if hours_since_training is None:
            return
        
        #only begin atrophy if given enough time for MYOPS to occur
        if hours_since_training > stimulus_duration:
            hours_in_atrophy = hours_since_training - stimulus_duration
            atrophy_period = 168 - stimulus_duration #based on stimulus window and maintenance volume
            atrophy_rate = cum[dataset][maintenance_volume-1] / atrophy_period
            self.atrophy += atrophy_rate * hours_in_atrophy

        return
    
    def reset_session(self):
            self.sets_this_session = 0
        
    def reset_week(self):
        self.sets_this_session = 0
        self.primary_sets = 0
        self.stimulus = 0.0
        self.last_trained_time = None
        self.last_session_time = None
        self.session_times = set()

    def net_weekly_stimulus(self):
        return self.stimulus - self.atrophy
    


#Class for an induvidual session
class Session:
    def __init__(self, name, day, exercises):
        self.name = name
        self.time = (day-1)*24 #how many hours into the split/cycle this sesssion was executed
        self.exercises = exercises

    def execute(self, muscles, stimulus_duration, dataset):
        if self.name == "Rest":
            return None
        
        global_sets = 0
        session_stats = {
            'time': self.time,
            'total_sets': 0,
            'muscles_trained': set(),
            'stimulus_by_muscle': defaultdict(float),
            'exercises_performed': []
        }

        #reset muscle at the beginning of execution
        for muscle in muscles.values():
            muscle.reset_session()

        
        if not self.exercises:
            return None
        
        #proceed to applying stimulus from a session
        for exercise, sets in self.exercises.items():
            pattern = move_match(exercise)
            if not pattern:
                continue
            #perform for each set and apply stimulus to each involved muscle group
            for i in range(sets):
                global_sets += 1
                for muscle_name, weight in pattern.targets.items():
                    muscle = muscles.get(muscle_name)
                    if not muscle:
                        continue
                    hours_since = None

                    if muscle.last_trained_time is not None:
                        hours_since = self.time - muscle.last_trained_time

                    muscle.apply_stimulus(weight, pattern.unilateral, hours_since, stimulus_duration, global_sets, dataset, self.time)

                    session_stats['stimulus_by_muscle'][muscle_name] += weight
                    session_stats['muscles_trained'].add(muscle_name)

            # Only update last trained time for muscles that received primary stimulus
            for muscle_name, weight in pattern.targets.items():
                if weight > 0.5:
                    #Must ensure that only primary movements reset the recovery timer
                    muscle = muscles.get(muscle_name)
                    if muscle:
                        muscle.last_trained_time = self.time
                        muscle.last_session_time = self.time  # Track which session last trained
                        muscle.session_times.add(self.time)

            session_stats['exercises_performed'].append({
                'pattern': pattern.name,
                'sets': sets,
                'unilateral': pattern.unilateral,
                'stimulus_by_muscle': dict(pattern.targets)
            })

        session_stats['total_sets'] = global_sets
        session_stats['muscles_trained'] = list(session_stats['muscles_trained'])
        session_stats['stimulus_by_muscle'] = dict(session_stats['stimulus_by_muscle'])

        return session_stats


#Split class for an arbitary split/cycle
class Split:
    def __init__(self , name, days, stimulus_duration, maintenance_volume, dataset):
        self.name = name
        self.stimulus_duration = stimulus_duration
        self.maintenance_volume = maintenance_volume
        self.dataset = dataset

        #days should be a list of 3-tuples (name,day,exercises) where exercises is a dictionary of movement:sets
        self.days = [Session(name, day, exercises) for name,day,exercises in days]

        self.cycle_length = len(self.days)
        self.muscles = {
            "pecs":                Muscle("pecs",             "M", "-"),
            "front_delt":          Muscle("front_delt",       "L", "0"),
            "middle_delt":         Muscle("middle_delt",      "M", "0"),
            "rear_delt":           Muscle("rear_delt",        "L", "0"),
            "upper_back":          Muscle("upper_back",       "L", "0"),
            "lats":                Muscle("lats",             "S", "0"),
            "quads":               Muscle("quads",            "L", "+"),
            "hamstrings":          Muscle("hamstrings",       "L", "-"),
            "calves":              Muscle("calves",           "L", "+"),
            "abs":                 Muscle("abs",              "L", "+"),
            "glutes":              Muscle("glutes",           "S", "0"),
            "erectors":            Muscle("erectors",         "S", "+"),
            "forearms":            Muscle("forearms",         "L", "+"),
            "biceps":              Muscle("biceps",           "L", "-"),
            "triceps":             Muscle("triceps",          "S", "-"),
            "adductors":           Muscle("adductors",        "L", "0")
        }
        self.session_stats = []

    #executes all phases of atrophy and stimulus for a given workout s;lit
    def simulate_split(self):
        if not self.days:
            return
        
        #must handle an arbitrary cycle of days robustly to average over a week
        weeks_to_sim = int(np.lcm(self.cycle_length, 7) / 7)
        total_days = weeks_to_sim * 7
        num_cycles = int(total_days / self.cycle_length)

        # Track weekly results for each muscle
        weekly_results = {muscle_name: [] for muscle_name in self.muscles.keys()}

        # Simulate each week separately
        for week in range(weeks_to_sim):
            week_start_hour = week * 168

            # Reset all muscles at the start of each week
            for muscle in self.muscles.values():
                muscle.reset_week()
                muscle.atrophy = 0

            # Create sessions for this week
            week_sessions = []
            for cycle in range(num_cycles):
                cycle_offset_hours = cycle * self.cycle_length * 24
                for session in self.days:
                    adjusted_time = session.time + cycle_offset_hours
                    # Only include sessions that fall within this week
                    if week_start_hour <= adjusted_time < week_start_hour + 168:
                        week_sessions.append((adjusted_time - week_start_hour, session))

            # Sort sessions by time within the week
            week_sessions.sort(key=lambda x: x[0])

            # Execute all sessions in this week
            for week_relative_time, session in week_sessions:
                for muscle in self.muscles.values():
                    if muscle.last_trained_time is not None:
                        hours_since = week_relative_time - muscle.last_trained_time
                        muscle.apply_atrophy(hours_since, self.stimulus_duration, self.dataset)

                # Temporarily set session time for execution
                original_time = session.time
                session.time = week_relative_time

                stats = session.execute(self.muscles, self.stimulus_duration, self.maintenance_volume, self.dataset)
                
                if stats:
                    # Adjust stats time to absolute time for reporting
                    stats['time'] = week_start_hour + week_relative_time
                    stats['week'] = week + 1
                    self.session_stats.append(stats)

                # Restore original time
                session.time = original_time

            # At end of week, calculate final atrophy and record weekly net stimulus
            for muscle_name, muscle in self.muscles.items():
                if muscle.last_trained_time is not None:
                    # Apply atrophy from last training to end of week
                    hours_until_end_of_week = 168 - muscle.last_trained_time
                    muscle.apply_atrophy(hours_until_end_of_week, self.stimulus_duration, self.maintenance_volume, self.dataset)

                weekly_net = muscle.net_weekly_stimulus()
                weekly_results[muscle_name].append({
                    'week': week + 1,
                    'stimulus': muscle.stimulus,
                    'atrophy': muscle.atrophy,
                    'net': weekly_net,
                    'primary_sets': muscle.primary_sets,
                    'sessions': len(muscle.session_times)
                })

        # Calculate average weekly values and store
        for muscle_name, muscle in self.muscles.items():
            weekly_data = weekly_results[muscle_name]
            if weekly_data:
                muscle.stimulus = sum(w['stimulus'] for w in weekly_data) / len(weekly_data)
                muscle.atrophy = sum(w['atrophy'] for w in weekly_data) / len(weekly_data)
                muscle.primary_sets = int(sum(w['primary_sets'] for w in weekly_data) / len(weekly_data))
                muscle.session_times = set([weekly_data[0]['sessions']])  # Store average session count


    def get_report(self):
        report = []
        report.append("=" * 80)
        report.append(f"SPLIT ANALYSIS REPORT: {self.name}")
        report.append("=" * 80)
        report.append(f"Cycle Length: {self.cycle_length} days")
        report.append(f"Stimulus Duration: {self.stimulus_duration} hours")
        report.append(f"Maintenance Volume: {self.maintenance_volume} sets")
        report.append(f"Dataset: {self.dataset}")
        report.append("")

        # === MUSCLE STIMULUS BREAKDOWN ===
        report.append("-" * 80)
        report.append("MUSCLE STIMULUS BREAKDOWN (Weekly Averages)")
        report.append("-" * 80)
        report.append(f"{'Muscle':<18} {'Stimulus':<10} {'Atrophy':<10} {'Net':<10} {'Sets':<8} {'Freq':<6}")
        report.append("-" * 80)

        # Sort muscles by net stimulus (descending)
        muscle_data = []
        for muscle_name, muscle in self.muscles.items():
            net_stim = muscle.net_weekly_stimulus()
            muscle_data.append({
                'name': muscle_name,
                'muscle': muscle,
                'net': net_stim,
                'stimulus': muscle.stimulus,
                'atrophy': muscle.atrophy,
                'sets': muscle.primary_sets,
                'freq': len(muscle.session_times) if muscle.session_times else 0
            })

        muscle_data.sort(key=lambda x: x['net'], reverse=True)

        for data in muscle_data:
            report.append(
                f"{data['name']:<18} "
                f"{data['stimulus']:>8.2f}  "
                f"{data['atrophy']:>8.2f}  "
                f"{data['net']:>8.2f}  "
                f"{data['sets']:>6}  "
                f"{data['freq']:>4}x"
            )

        report.append("")

        # === OPTIMIZATION SUGGESTIONS ===
        report.append("-" * 80)
        report.append("OPTIMIZATION SUGGESTIONS")
        report.append("-" * 80)

        suggestions = []

        # Analyze each muscle for optimization opportunities
        for data in muscle_data:
            muscle = data['muscle']
            name = data['name']
            net = data['net']
            sets = data['sets']
            freq = data['freq']
            atrophy = data['atrophy']
            stimulus = data['stimulus']

            # 1. Under-stimulated muscles (low net stimulus)
            if net < 1.0 and sets > 0:
                suggestions.append({
                    'priority': 'HIGH',
                    'muscle': name,
                    'issue': 'Under-stimulated',
                    'suggestion': f"Net stimulus is only {net:.2f}. Consider adding 2-4 more sets or increasing training frequency."
                })
            elif net < 2.0 and sets > 0:
                suggestions.append({
                    'priority': 'MEDIUM',
                    'muscle': name,
                    'issue': 'Low stimulus',
                    'suggestion': f"Net stimulus is {net:.2f}. Could benefit from 1-2 additional sets."
                })

            # 2. Untrained muscles
            if sets == 0:
                suggestions.append({
                    'priority': 'HIGH',
                    'muscle': name,
                    'issue': 'Not trained',
                    'suggestion': f"No direct training. Add at least {self.maintenance_volume} sets per week."
                })

            # 3. Over-trained muscles (excessive sets with diminishing returns)
            if sets > 12:
                suggestions.append({
                    'priority': 'MEDIUM',
                    'muscle': name,
                    'issue': 'Excessive volume',
                    'suggestion': f"Weekly volume is {sets} sets. Consider reducing to 8-12 sets for better recovery."
                })

            # 4. High atrophy relative to stimulus (poor frequency)
            if stimulus > 0 and atrophy > 0:
                atrophy_ratio = atrophy / stimulus
                if atrophy_ratio > 0.4 and freq <= 1:
                    suggestions.append({
                        'priority': 'HIGH',
                        'muscle': name,
                        'issue': 'High atrophy',
                        'suggestion': f"Atrophy is {atrophy_ratio*100:.1f}% of stimulus. Increase frequency to 2x per week."
                    })
                elif atrophy_ratio > 0.3 and freq <= 1:
                    suggestions.append({
                        'priority': 'MEDIUM',
                        'muscle': name,
                        'issue': 'Suboptimal frequency',
                        'suggestion': f"Training only {freq}x per week with {atrophy_ratio*100:.1f}% atrophy ratio. Consider 2x frequency."
                    })

            # 5. Moderate volume with very high frequency (could consolidate)
            if freq >= 4 and sets < 8:
                suggestions.append({
                    'priority': 'LOW',
                    'muscle': name,
                    'issue': 'High frequency, low volume',
                    'suggestion': f"Training {freq}x per week with only {sets} total sets. Could consolidate to 2-3 sessions."
                })

            # 6. Muscle-specific leverage considerations
            if muscle.leverage == "S" and sets > 0 and sets < self.maintenance_volume + 2:
                suggestions.append({
                    'priority': 'LOW',
                    'muscle': name,
                    'issue': 'Short leverage muscle',
                    'suggestion': f"Short leverage muscles benefit from higher volumes. Current: {sets} sets."
                })

            # 7. High damage tier muscles with high volume
            if muscle.damage_tier == "+" and sets > 10:
                suggestions.append({
                    'priority': 'LOW',
                    'muscle': name,
                    'issue': 'High damage + high volume',
                    'suggestion': f"High damage tier muscle with {sets} sets. Monitor recovery closely."
                })

        # Sort suggestions by priority
        priority_order = {'HIGH': 0, 'MEDIUM': 1, 'LOW': 2}
        suggestions.sort(key=lambda x: (priority_order[x['priority']], x['muscle']))

        # Display suggestions by priority
        if not suggestions:
            report.append("No major optimization issues detected. Split looks well-balanced!")
        else:
            for priority in ['HIGH', 'MEDIUM', 'LOW']:
                priority_suggestions = [s for s in suggestions if s['priority'] == priority]
                if priority_suggestions:
                    report.append(f"\n[{priority} PRIORITY]")
                    for sug in priority_suggestions:
                        report.append(f"  • {sug['muscle']}: {sug['suggestion']}")

        report.append("")

        # === SUMMARY STATISTICS ===
        report.append("-" * 80)
        report.append("SUMMARY STATISTICS")
        report.append("-" * 80)

        total_sets = sum(data['sets'] for data in muscle_data)
        trained_muscles = sum(1 for data in muscle_data if data['sets'] > 0)
        avg_net_stimulus = sum(data['net'] for data in muscle_data if data['sets'] > 0) / max(trained_muscles, 1)

        report.append(f"Total weekly sets: {total_sets}")
        report.append(f"Muscles trained: {trained_muscles}/{len(self.muscles)}")
        report.append(f"Average net stimulus (trained muscles): {avg_net_stimulus:.2f}")
        report.append(f"Average sets per muscle: {total_sets / max(trained_muscles, 1):.1f}")

        report.append("")
        report.append("=" * 80)

        return "\n".join(report)
